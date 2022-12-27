import {
  assertNever,
  defaultTypeMapping,
  DuplicateColumnsError,
  getOrSetFromMap,
  groupBy,
  IdentiferCase,
  ParsedQuery,
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

type JSToPostgresTypeMap = Record<string, unknown>;
type Sql = postgres.Sql<JSToPostgresTypeMap>;

export type GenerateResult = { result: string | null; stmt: postgres.Statement; query: string };
export type GenerateError = DuplicateColumnsError | PostgresError;

type CacheKey = string;

export interface GenerateParams {
  sql: Sql;
  query: string;
  pgParsed: ParsedQuery.Root;
  cacheMetadata?: boolean;
  cacheKey: CacheKey;
  fieldTransform: IdentiferCase | undefined;
  overrides?: Partial<{
    types: Record<string, string>;
  }>;
}

type CacheMap = Map<
  CacheKey,
  {
    pgTypes: postgres.RowList<PgTypeRow[]>;
    pgCols: PgColRow[];
    pgColsByTableOidCache: Map<number, PgColRow[]>;
  }
>;

export function createGenerator() {
  const cacheMap: CacheMap = new Map();

  return {
    generate: (params: GenerateParams) => generate(params, cacheMap),
    dropCacheKey: (cacheKey: CacheKey) => cacheMap.delete(cacheKey),
    clearCache: () => cacheMap.clear(),
  };
}

async function generate(
  params: GenerateParams,
  cacheMap: CacheMap
): Promise<either.Either<GenerateError, GenerateResult>> {
  const { sql, query, cacheMetadata = true } = params;

  const { pgColsByTableOidCache, pgTypes } = cacheMetadata
    ? await getOrSetFromMap({
        map: cacheMap,
        key: params.cacheKey,
        value: () => getDatabaseMetadata(sql),
      })
    : await getDatabaseMetadata(sql);

  try {
    const result = await sql.unsafe(query, [], { prepare: true }).describe();

    if (result.columns === undefined || result.columns === null || result.columns.length === 0) {
      return either.right({ result: null, stmt: result, query: query });
    }

    const duplicateCols = result.columns.filter((col, index) =>
      result.columns.find((c, i) => c.name === col.name && i != index)
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
        })
      );
    }

    const relationsWithJoins = flattenRelationsWithJoinsMap(getRelationsWithJoins(params.pgParsed));

    const columns = result.columns.map((col): ColumnAnalysisResult => {
      const introspected = pgColsByTableOidCache
        .get(col.table)
        ?.find((x) => x.colNum === col.number);
      return introspected === undefined ? { described: col } : { described: col, introspected };
    });

    const typesMap = { ...defaultTypeMapping, ...params.overrides?.types };

    return either.right({
      result: mapColumnAnalysisResultsToTypeLiteral({
        columns,
        pgTypes,
        relationsWithJoins,
        typesMap,
        fieldTransform: params.fieldTransform,
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
        })
      );
    }

    throw e;
  }
}

async function getDatabaseMetadata(sql: Sql) {
  const pgTypes = await getPgTypes(sql);
  const pgCols = await getPgCols(sql);
  const pgColsByTableOidCache = groupBy(pgCols, "tableOid");

  return { pgTypes, pgCols, pgColsByTableOidCache };
}

type ColumnAnalysisResult =
  | { described: postgres.Column<string> }
  | { described: postgres.Column<string>; introspected: PgColRow };

function mapColumnAnalysisResultsToTypeLiteral(params: {
  columns: ColumnAnalysisResult[];
  pgTypes: PgTypeRow[];
  relationsWithJoins: FlattenedRelationWithJoins[];
  typesMap: Record<string, string>;
  fieldTransform: IdentiferCase | undefined;
}) {
  const properties = params.columns.map((col) => {
    const propertySignature = mapColumnAnalysisResultToPropertySignature({
      col,
      pgTypes: params.pgTypes,
      relationsWithJoins: params.relationsWithJoins,
      typesMap: params.typesMap,
      fieldTransform: params.fieldTransform,
    });

    return `${propertySignature};`;
  });

  return `{ ${properties.join(" ")} }`;
}

function buildInterfacePropertyValue(params: { key: string; value: string; isNullable: boolean }) {
  const isNullable = params.isNullable && ["any", "null"].includes(params.value) === false;

  return `${params.key}: ${isNullable ? `${params.value} | null` : params.value}`;
}

function isNullableDueToRelation(params: {
  col: PgColRow;
  relationsWithJoins: FlattenedRelationWithJoins[];
}) {
  const { col, relationsWithJoins } = params;

  const findByJoin = relationsWithJoins.find((x) => x.joinRelName === col.tableName);

  if (findByJoin !== undefined) {
    switch (findByJoin.joinType) {
      case "JOIN_FULL":
      case "JOIN_LEFT":
        return true;
      case "JOIN_ANTI":
      case "JOIN_INNER":
      case "JOIN_RIGHT":
      case "JOIN_SEMI":
        return false;
      default:
        assertNever(findByJoin.joinType);
    }
  }

  const findByRel = relationsWithJoins.filter((x) => x.relName === col.tableName);

  for (const rel of findByRel) {
    switch (rel.joinType) {
      case "JOIN_RIGHT":
      case "JOIN_FULL":
        return true;
      case "JOIN_LEFT":
      case "JOIN_ANTI":
      case "JOIN_INNER":
      case "JOIN_SEMI":
        continue;
      default:
        assertNever(rel.joinType);
    }
  }

  return false;
}

function mapColumnAnalysisResultToPropertySignature(params: {
  col: ColumnAnalysisResult;
  pgTypes: PgTypeRow[];
  relationsWithJoins: FlattenedRelationWithJoins[];
  typesMap: Record<string, string>;
  fieldTransform: IdentiferCase | undefined;
}) {
  if ("introspected" in params.col) {
    const value = params.typesMap[params.col.introspected.colType];
    const key = params.col.described.name ?? params.col.introspected.colName;
    const isNullable = !params.col.introspected.colNotNull || isNullableDueToRelation({
      col: params.col.introspected,
      relationsWithJoins: params.relationsWithJoins,
    });

    return buildInterfacePropertyValue({
      key: toCase(key, params.fieldTransform),
      value: value,
      isNullable: isNullable,
    });
  }

  const nonTableColumnType = getTsTypeFromPgTypeOid({
    pgTypeOid: params.col.described.type,
    pgTypes: params.pgTypes,
    typesMap: params.typesMap,
  });

  return buildInterfacePropertyValue({
    key: toCase(params.col.described.name, params.fieldTransform),
    value: nonTableColumnType,
    isNullable: false,
  });
}

function getTsTypeFromPgTypeOid(params: {
  pgTypes: PgTypeRow[];
  pgTypeOid: number;
  typesMap: Record<string, string>;
}) {
  const pgType = params.pgTypes.find((type) => type.oid === params.pgTypeOid);

  if (pgType === undefined) {
    return "unknown";
  }

  return getTsTypeFromPgType({ pgTypeName: pgType.name, typesMap: params.typesMap });
}

function getTsTypeFromPgType(params: {
  pgTypeName: ColType | `_${ColType}`;
  typesMap: Record<string, string>;
}) {
  const { isArray, pgType } = parsePgType(params.pgTypeName);
  const tsType = params.typesMap[pgType] ?? "any";

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

interface PgTypeRow {
  oid: number;
  name: ColType;
}

async function getPgTypes(sql: Sql) {
  const rows = await sql<PgTypeRow[]>`
        SELECT oid, typname as name FROM pg_type
    `;

  return rows;
}

interface PgColRow {
  tableOid: number;
  tableName: string;
  colName: string;
  colType: ColType;
  colNum: number;
  colHasDef: boolean;
  colNotNull: boolean;
}

async function getPgCols(sql: Sql) {
  const rows = await sql<PgColRow[]>`
        SELECT
            pg_class.oid as "tableOid",
            pg_class.relname as "tableName",
            pg_attribute.attname as "colName",
            pg_type.typname as "colType",
            pg_attribute.attnum as "colNum",
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
