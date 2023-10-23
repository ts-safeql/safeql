import {
  assertNever,
  defaultTypesMap,
  DuplicateColumnsError,
  fmap,
  getOrSetFromMapWithEnabled,
  groupBy,
  IdentiferCase,
  LibPgQueryAST,
  PostgresError,
  toCase,
} from "@ts-safeql/shared";
import { either } from "fp-ts";
import postgres, { PostgresError as OriginalPostgresError } from "postgres";
import { ColType } from "./utils/colTypes";
import {
  FlattenedRelationWithJoins,
  flattenRelationsWithJoinsMap,
  getRelationsWithJoins,
} from "./utils/get-relations-with-joins";
import { getNonNullableColumns } from "./utils/get-nonnullable-columns";

type JSToPostgresTypeMap = Record<string, unknown>;
type Sql = postgres.Sql<JSToPostgresTypeMap>;

export type GenerateResult = {
  result: [string, string][] | null;
  stmt: postgres.Statement;
  query: string;
};
export type GenerateError = DuplicateColumnsError | PostgresError;

type CacheKey = string;
type OverrideValue = string | { parameter: string | { regex: string }; return: string };
type Overrides = {
  types: Map<string, OverrideValue>;
};

export interface GenerateParams {
  sql: Sql;
  query: string;
  pgParsed: LibPgQueryAST.ParseResult;
  cacheMetadata?: boolean;
  cacheKey: CacheKey;
  fieldTransform: IdentiferCase | undefined;
  nullAsUndefined?: boolean;
  nullAsOptional?: boolean;
  overrides?: Partial<{
    types: Record<string, OverrideValue>;
  }>;
}

type CacheMap = Map<
  CacheKey,
  {
    pgTypes: PgTypesMap;
    pgCols: PgColRow[];
    pgEnums: PgEnumsMaps;
    pgColsByTableOidCache: Map<number, PgColRow[]>;
  }
>;

type OverrideMap = Map<CacheKey, { types: Map<string, OverrideValue> }>;

export function createGenerator() {
  const cacheMap: CacheMap = new Map();
  const overrideMap: OverrideMap = new Map();

  return {
    generate: (params: GenerateParams) => generate(params, cacheMap, overrideMap),
    dropCacheKey: (cacheKey: CacheKey) => cacheMap.delete(cacheKey),
    clearCache: () => cacheMap.clear(),
  };
}

async function generate(
  params: GenerateParams,
  cacheMap: CacheMap,
  overrideMap: OverrideMap,
): Promise<either.Either<GenerateError, GenerateResult>> {
  const { sql, query, cacheKey, cacheMetadata = true } = params;

  const { pgColsByTableOidCache, pgTypes, pgEnums } = await getOrSetFromMapWithEnabled({
    shouldCache: cacheMetadata,
    map: cacheMap,
    key: cacheKey,
    value: () => getDatabaseMetadata(sql),
  });

  const overrides = await getOrSetFromMapWithEnabled({
    shouldCache: cacheMetadata,
    map: overrideMap,
    key: JSON.stringify(params.overrides),
    value: () => ({ types: new Map(Object.entries(params.overrides?.types ?? {})) }),
  });

  try {
    const result = await sql.unsafe(query, [], { prepare: true }).describe();

    if (result.columns === undefined || result.columns === null || result.columns.length === 0) {
      return either.right({ result: null, stmt: result, query: query });
    }

    const duplicateCols = result.columns.filter((col, index) =>
      result.columns.find((c, i) => c.name === col.name && i != index),
    );

    if (duplicateCols.length > 0) {
      const dupes = duplicateCols.map((col) => ({
        table: pgColsByTableOidCache.get(col.table)!.find((c) => c.colName === col.name)!.tableName,
        column: col.name,
      }));

      return either.left(
        DuplicateColumnsError.of({
          queryText: query,
          columns: dupes.map((x) => `${x.table}.${x.column}`),
        }),
      );
    }

    const relationsWithJoins = flattenRelationsWithJoinsMap(getRelationsWithJoins(params.pgParsed));
    const nonNullableColumnsBasedOnAST = getNonNullableColumns(params.pgParsed);

    const columns = result.columns.map((col): ColumnAnalysisResult => {
      const introspected = pgColsByTableOidCache
        .get(col.table)
        ?.find((x) => x.colNum === col.number);

      return {
        described: col,
        introspected: introspected,
        isNonNullableBasedOnAST: nonNullableColumnsBasedOnAST.has(col.name),
      };
    });

    return either.right({
      result: mapColumnAnalysisResultsToTypeLiteral({
        columns,
        pgTypes,
        pgEnums,
        relationsWithJoins,
        overrides,
        fieldTransform: params.fieldTransform,
        nullAsUndefined: params.nullAsUndefined,
        nullAsOptional: params.nullAsOptional,
      }),
      stmt: result,
      query: query,
    });
  } catch (e) {
    if (e instanceof OriginalPostgresError) {
      return either.left(
        PostgresError.of({
          queryText: query,
          message: e.message,
          line: e.line,
          position: e.position,
        }),
      );
    }

    throw e;
  }
}

async function getDatabaseMetadata(sql: Sql) {
  const pgTypes = await getPgTypes(sql);
  const pgCols = await getPgCols(sql);
  const pgEnums = await getPgEnums(sql);
  const pgColsByTableOidCache = groupBy(pgCols, "tableOid");

  return { pgTypes, pgCols, pgEnums, pgColsByTableOidCache };
}

type ColumnAnalysisResult = {
  described: postgres.Column<string>;
  introspected: PgColRow | undefined;
  isNonNullableBasedOnAST: boolean;
};

function mapColumnAnalysisResultsToTypeLiteral(params: {
  columns: ColumnAnalysisResult[];
  pgTypes: PgTypesMap;
  pgEnums: PgEnumsMaps;
  relationsWithJoins: FlattenedRelationWithJoins[];
  overrides: Overrides | undefined;
  fieldTransform: IdentiferCase | undefined;
  nullAsUndefined?: boolean;
  nullAsOptional?: boolean;
}): [string, string][] {
  const properties = params.columns.map((col) => {
    const propertySignature = mapColumnAnalysisResultToPropertySignature({
      col,
      pgTypes: params.pgTypes,
      pgEnums: params.pgEnums,
      relationsWithJoins: params.relationsWithJoins,
      overrides: params.overrides,
      fieldTransform: params.fieldTransform,
      nullAsUndefined: params.nullAsUndefined,
      nullAsOptional: params.nullAsOptional,
    });

    return propertySignature;
  });
  return properties;
}

function buildInterfacePropertyValue(params: {
  key: string;
  value: string;
  isNullable: boolean;
  nullAsUndefined?: boolean;
  nullAsOptional?: boolean;
}): [string, string] {
  const nullType = params.nullAsUndefined ? "undefined" : "null";
  const isNullable = params.isNullable && ["any", "null"].includes(params.value) === false;

  if (!isNullable) {
    return [params.key, params.value];
  }

  return [params.nullAsOptional ? `${params.key}?` : params.key, `${params.value} | ${nullType}`];
}

function checkIsNullableDueToRelation(params: {
  col: PgColRow;
  relationsWithJoins: FlattenedRelationWithJoins[];
}) {
  const { col, relationsWithJoins } = params;

  const findByJoin = relationsWithJoins.find((x) => x.joinRelName === col.tableName);

  if (findByJoin !== undefined) {
    switch (findByJoin.joinType) {
      case LibPgQueryAST.JoinType.JOIN_LEFT:
      case LibPgQueryAST.JoinType.JOIN_FULL:
        return true;
      case LibPgQueryAST.JoinType.JOIN_TYPE_UNDEFINED:
      case LibPgQueryAST.JoinType.JOIN_INNER:
      case LibPgQueryAST.JoinType.JOIN_RIGHT:
      case LibPgQueryAST.JoinType.JOIN_SEMI:
      case LibPgQueryAST.JoinType.JOIN_ANTI:
      case LibPgQueryAST.JoinType.JOIN_UNIQUE_OUTER:
      case LibPgQueryAST.JoinType.JOIN_UNIQUE_INNER:
      case LibPgQueryAST.JoinType.UNRECOGNIZED:
        return false;
      default:
        assertNever(findByJoin.joinType);
    }
  }

  const findByRel = relationsWithJoins.filter((x) => x.relName === col.tableName);

  for (const rel of findByRel) {
    switch (rel.joinType) {
      case LibPgQueryAST.JoinType.JOIN_RIGHT:
      case LibPgQueryAST.JoinType.JOIN_FULL:
        return true;
      case LibPgQueryAST.JoinType.JOIN_TYPE_UNDEFINED:
      case LibPgQueryAST.JoinType.JOIN_INNER:
      case LibPgQueryAST.JoinType.JOIN_LEFT:
      case LibPgQueryAST.JoinType.JOIN_SEMI:
      case LibPgQueryAST.JoinType.JOIN_ANTI:
      case LibPgQueryAST.JoinType.JOIN_UNIQUE_OUTER:
      case LibPgQueryAST.JoinType.JOIN_UNIQUE_INNER:
      case LibPgQueryAST.JoinType.UNRECOGNIZED:
        return false;
      default:
        assertNever(rel.joinType);
    }
  }

  return false;
}

function mapColumnAnalysisResultToPropertySignature(params: {
  col: ColumnAnalysisResult;
  pgTypes: PgTypesMap;
  pgEnums: PgEnumsMaps;
  relationsWithJoins: FlattenedRelationWithJoins[];
  overrides: Overrides | undefined;
  fieldTransform: IdentiferCase | undefined;
  nullAsUndefined?: boolean;
  nullAsOptional?: boolean;
}) {
  const pgTypeOid = params.col.introspected?.colBaseTypeOid ?? params.col.described.type;

  const valueAsEnum = params.pgEnums
    .get(pgTypeOid)
    ?.values.map((x) => `'${x}'`)
    .join(" | ");

  const valueAsType = getTsTypeFromPgTypeOid({
    pgTypeOid: pgTypeOid,
    pgTypes: params.pgTypes,
  });

  const valueAsOverride = (() => {
    const pgType = params.pgTypes.get(
      params.col.introspected?.colTypeOid ?? params.col.described.type,
    );

    if (params.overrides?.types === undefined || pgType === undefined) {
      return undefined;
    }

    const override = params.overrides.types.get(pgType.name);
    return fmap(override, (x) => (typeof x === "string" ? x : x.return));
  })();

  const value = valueAsOverride ?? valueAsEnum ?? valueAsType;
  const key = params.col.described.name ?? params.col.introspected?.colName;

  let isNonNullable = params.col.isNonNullableBasedOnAST;

  if (!isNonNullable && params.col.introspected !== undefined) {
    isNonNullable = params.col.introspected.colNotNull;

    if (
      checkIsNullableDueToRelation({
        col: params.col.introspected,
        relationsWithJoins: params.relationsWithJoins,
      })
    ) {
      isNonNullable = false;
    }
  }

  return buildInterfacePropertyValue({
    key: toCase(key, params.fieldTransform),
    value: value,
    isNullable: !isNonNullable,
    nullAsUndefined: params.nullAsUndefined,
    nullAsOptional: params.nullAsOptional,
  });
}

function getTsTypeFromPgTypeOid(params: { pgTypes: PgTypesMap; pgTypeOid: number }) {
  const pgType = params.pgTypes.get(params.pgTypeOid);

  if (pgType === undefined) {
    return "unknown";
  }

  return getTsTypeFromPgType({ pgTypeName: pgType.name });
}

function getTsTypeFromPgType(params: { pgTypeName: ColType | `_${ColType}` }) {
  const { isArray, pgType } = parsePgType(params.pgTypeName);
  const tsType = defaultTypesMap.get(pgType) ?? "any";

  return isArray ? `${tsType}[]` : tsType;
}

function isPgTypeArray(pgType: ColType | `_${ColType}`): pgType is `_${ColType}` {
  return pgType.startsWith("_");
}

function parsePgType(pgType: ColType | `_${ColType}`) {
  const isArray = isPgTypeArray(pgType);

  return {
    isArray: isArray,
    pgType: isArray ? (pgType.slice(1) as ColType) : pgType,
  };
}

interface PgEnumRow {
  oid: number;
  typname: string;
  enumlabel: string;
}

type PgEnumsMaps = Map<number, { name: string; values: string[] }>;

async function getPgEnums(sql: Sql): Promise<PgEnumsMaps> {
  const rows = await sql<PgEnumRow[]>`
    SELECT pg_type.oid, pg_type.typname, pg_enum.enumlabel
    FROM pg_type
    JOIN pg_enum ON pg_enum.enumtypid = pg_type.oid
    WHERE pg_type.typtype = 'e'
    ORDER BY pg_type.typname, pg_enum.enumsortorder
  `;

  const map = new Map<number, { name: string; values: string[] }>();

  for (const row of rows) {
    const existing = map.get(row.oid);

    if (existing === undefined) {
      map.set(row.oid, {
        name: row.typname,
        values: [row.enumlabel],
      });

      continue;
    }

    existing.values.push(row.enumlabel);
  }

  return map;
}

interface PgTypeRow {
  oid: number;
  name: ColType;
}

type PgTypesMap = Map<number, PgTypeRow>;

async function getPgTypes(sql: Sql): Promise<PgTypesMap> {
  const rows = await sql<PgTypeRow[]>`
        SELECT oid, typname as name FROM pg_type
    `;

  const map = new Map<number, PgTypeRow>();

  for (const row of rows) {
    map.set(row.oid, row);
  }

  return map;
}

interface PgColRow {
  tableOid: number;
  tableName: string;
  colName: string;
  colTypeOid: number;
  colBaseTypeOid: number | null;
  colNum: number;
  colHasDef: boolean;
  colNotNull: boolean;
}

async function getPgCols(sql: Sql) {
  const rows = await sql<PgColRow[]>`
      SELECT
          pg_class.oid AS "tableOid",
          pg_class.relname AS "tableName",
          pg_attribute.attname AS "colName",
          pg_type.oid AS "colTypeOid",
          CASE
              WHEN pg_type.typtype = 'd' THEN
                  (SELECT pt.oid FROM pg_type pt WHERE pt.oid = pg_type.typbasetype)
              ELSE
                  NULL
          END AS "colBaseTypeOid",
          pg_attribute.attnum AS "colNum",
          pg_attribute.atthasdef "colHasDef",
          pg_attribute.attnotnull "colNotNull"
      FROM
          pg_attribute,
          pg_class,
          pg_type
      WHERE TRUE
          AND pg_attribute.attrelid = pg_class.oid
          AND pg_attribute.atttypid = pg_type.oid
          AND pg_attribute.attnum >= 1
      ORDER BY
          pg_class.relname,
          pg_attribute.attname
  `;

  return rows;
}
