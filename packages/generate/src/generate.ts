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
import { getJsonTargetTypes, JsonTarget, NamedJsonTarget } from "./utils/get-json-target-types";
import { getNonNullableColumns } from "./utils/get-nonnullable-columns";
import {
  FlattenedRelationWithJoins,
  flattenRelationsWithJoinsMap,
  getRelationsWithJoins,
} from "./utils/get-relations-with-joins";
import { getResolvedStatementFromParseResult } from "./utils/get-resolved-statement";

type JSToPostgresTypeMap = Record<string, unknown>;
type Sql = postgres.Sql<JSToPostgresTypeMap>;

export type ResolvedTarget =
  | { kind: "type"; value: string }
  | { kind: "union"; value: ResolvedTarget[] }
  | { kind: "array"; value: ResolvedTarget }
  | { kind: "object"; value: ResolvedTargetEntry[] };

export type ResolvedTargetEntry = [string, ResolvedTarget];

export type GenerateResult = {
  output: Extract<ResolvedTarget, { kind: "object" }> | null;
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
    pgColsByTableName: Map<string, PgColRow[]>;
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

type GenerateContext = {
  columns: ColumnAnalysisResult[];
  pgTypes: PgTypesMap;
  pgEnums: PgEnumsMaps;
  relationsWithJoins: FlattenedRelationWithJoins[];
  overrides: Overrides | undefined;
  jsonTargets: JsonTarget[];
  pgColsByTableName: Map<string, PgColRow[]>;
  fieldTransform: IdentiferCase | undefined;
};

async function generate(
  params: GenerateParams,
  cacheMap: CacheMap,
  overrideMap: OverrideMap
): Promise<either.Either<GenerateError, GenerateResult>> {
  const { sql, query, cacheKey, cacheMetadata = true } = params;

  const { pgColsByTableOidCache, pgColsByTableName, pgTypes, pgEnums } =
    await getOrSetFromMapWithEnabled({
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
      return either.right({ output: null, stmt: result, query: query });
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
    const nonNullableColumnsBasedOnAST = getNonNullableColumns(params.pgParsed);
    const resolvedStatement = getResolvedStatementFromParseResult(params.pgParsed);
    const jsonTargets = getJsonTargetTypes(params.pgParsed, resolvedStatement);

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

    const context: GenerateContext = {
      columns,
      pgTypes,
      pgEnums,
      relationsWithJoins,
      overrides,
      jsonTargets,
      pgColsByTableName,
      fieldTransform: params.fieldTransform,
    };

    return either.right({
      output: getTypedColumnEntries({ context }),
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
  const pgEnums = await getPgEnums(sql);
  const pgColsByTableOidCache = groupBy(pgCols, "tableOid");
  const pgColsByTableName = groupBy(pgCols, "tableName");

  return { pgTypes, pgCols, pgEnums, pgColsByTableOidCache, pgColsByTableName };
}

type ColumnAnalysisResult = {
  described: postgres.Column<string>;
  introspected: PgColRow | undefined;
  isNonNullableBasedOnAST: boolean;
};

function getTypedColumnEntries(params: {
  context: GenerateContext;
}): Extract<ResolvedTarget, { kind: "object" }> {
  const value = params.context.columns.map((col) =>
    getResolvedTargetEntry({ col, context: params.context })
  );

  return { kind: "object", value };
}

function isNullableResolvedTarget(target: ResolvedTarget): boolean {
  switch (target.kind) {
    case "type":
      return ["any", "null"].includes(target.value) === false;
    case "union":
      return target.value.some(isNullableResolvedTarget);
    case "array":
      return isNullableResolvedTarget(target.value);
    case "object":
      return target.value.some(([, value]) => isNullableResolvedTarget(value));
  }
}

function buildInterfacePropertyValue(params: {
  key: string;
  value: ResolvedTarget;
  isNullable: boolean;
}): [string, ResolvedTarget] {
  const isNullable = params.isNullable && isNullableResolvedTarget(params.value);

  return [
    params.key,
    isNullable
      ? { kind: "union", value: [params.value, { kind: "type", value: "null" }] }
      : params.value,
  ];
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

function getResolvedTargetEntry(params: {
  col: ColumnAnalysisResult;
  context: GenerateContext;
}): ResolvedTargetEntry {
  const pgTypeOid = params.col.introspected?.colBaseTypeOid ?? params.col.described.type;

  const valueAsJson = getColJsonResolvedTargetEntry({
    col: params.col,
    context: params.context,
  });

  if (valueAsJson !== undefined) {
    return valueAsJson;
  }

  const valueAsEnum = fmap(
    params.context.pgEnums.get(pgTypeOid),
    ({ values }): ResolvedTarget => ({
      kind: "union",
      value: values.map((x): ResolvedTarget => ({ kind: "type", value: `'${x}'` })),
    })
  );

  const valueAsType = getTsTypeFromPgTypeOid({
    pgTypeOid: pgTypeOid,
    pgTypes: params.context.pgTypes,
  });

  const valueAsOverride = (() => {
    const pgType = params.context.pgTypes.get(
      params.col.introspected?.colTypeOid ?? params.col.described.type
    );

    if (params.context.overrides?.types === undefined || pgType === undefined) {
      return undefined;
    }

    const override = params.context.overrides.types.get(pgType.name);

    return fmap(
      override,
      (x): ResolvedTarget => ({ kind: "type", value: typeof x === "string" ? x : x.return })
    );
  })();

  const value = valueAsOverride ?? valueAsEnum ?? valueAsType;
  const key = params.col.described.name ?? params.col.introspected?.colName;

  let isNonNullable = params.col.isNonNullableBasedOnAST;

  if (!isNonNullable && params.col.introspected !== undefined) {
    isNonNullable = params.col.introspected.colNotNull;

    if (
      checkIsNullableDueToRelation({
        col: params.col.introspected,
        relationsWithJoins: params.context.relationsWithJoins,
      })
    ) {
      isNonNullable = false;
    }
  }

  return buildInterfacePropertyValue({
    key: toCase(key, params.context.fieldTransform),
    value: value,
    isNullable: !isNonNullable,
  });
}

function getResolvedTargetEntryByTableJsonTarget(params: {
  col: ColumnAnalysisResult;
  jsonTarget: NamedJsonTarget["table"];
  context: GenerateContext;
}): ResolvedTargetEntry | undefined {
  const { value } = getTypedColumnEntries({
    context: {
      ...params.context,
      columns:
        params.context.pgColsByTableName
          .get(params.jsonTarget.table)
          ?.map((col) => ({
            described: {
              name: col.colName,
              table: col.tableOid,
              type: col.colTypeOid,
              number: col.colNum,
            },
            introspected: col,
            isNonNullableBasedOnAST: true,
          }))
          .sort((a, b) => a.described.number - b.described.number) ?? [],
    },
  });

  return [params.col.described.name, { kind: "object", value }];
}

function getResolvedTargetEntryByColumnJsonTarget(params: {
  col: ColumnAnalysisResult;
  jsonTarget: NamedJsonTarget["column"];
  context: GenerateContext;
}): ResolvedTargetEntry | undefined {
  const col = params.context.pgColsByTableName
    .get(params.jsonTarget.table)
    ?.find((col) => col.colName === params.jsonTarget.column);

  if (col === undefined) {
    return;
  }

  const [, entryType] = getResolvedTargetEntry({
    context: params.context,
    col: {
      described: {
        name: col.colName,
        table: col.tableOid,
        type: col.colTypeOid,
        number: col.colNum,
      },
      introspected: col,
      isNonNullableBasedOnAST: true,
    },
  });

  return [params.col.described.name, entryType];
}

function getColJsonResolvedTargetEntry(params: {
  col: ColumnAnalysisResult;
  context: GenerateContext;
}): ResolvedTargetEntry | undefined {
  const pgTypeOid = params.col.introspected?.colBaseTypeOid ?? params.col.described.type;
  const pgTypeName = params.context.pgTypes.get(pgTypeOid)?.name;

  if (
    params.col.described.table !== 0 ||
    pgTypeName === undefined ||
    !["json", "jsonb"].includes(pgTypeName)
  ) {
    return;
  }

  const jsonTarget = params.context.jsonTargets.find(
    (x) => x.kind !== "type" && x.name === params.col.described.name
  );

  if (jsonTarget !== undefined) {
    return getResolvedTargetEntryByJsonTarget({ ...params, jsonTarget });
  }
}
function getResolvedTargetEntryByJsonTarget(params: {
  col: ColumnAnalysisResult;
  jsonTarget: JsonTarget;
  context: GenerateContext;
}): ResolvedTargetEntry | undefined {
  switch (params.jsonTarget.kind) {
    case "table":
      return getResolvedTargetEntryByTableJsonTarget({ ...params, jsonTarget: params.jsonTarget });
    case "column":
      return getResolvedTargetEntryByColumnJsonTarget({ ...params, jsonTarget: params.jsonTarget });
    case "object":
      return getResolvedTargetEntryByObjectJsonTarget({ ...params, jsonTarget: params.jsonTarget });
    case "array":
      return getResolvedTargetEntryByArrayTarget({ ...params, jsonTarget: params.jsonTarget });
    case "type":
      return [
        params.col.described.name,
        getTsTypeFromPgType({ pgTypeName: params.jsonTarget.type }),
      ];
    case "type-cast":
      return [
        params.col.described.name,
        getTsTypeFromPgType({ pgTypeName: params.jsonTarget.type }),
      ];
  }
}

function getResolvedTargetEntryByArrayTarget(params: {
  col: ColumnAnalysisResult;
  jsonTarget: NamedJsonTarget["array"];
  context: GenerateContext;
}): ResolvedTargetEntry | undefined {
  if (params.jsonTarget.target.kind === "type") {
    const tsType = getTsTypeFromPgType({ pgTypeName: params.jsonTarget.target.type });
    return [params.col.described.name, tsType];
  }

  const typedEntry = getColJsonResolvedTargetEntry({
    context: {
      ...params.context,
      jsonTargets: [params.jsonTarget.target],
    },
    col: {
      described: {
        name: params.col.described.name,
        table: params.col.described.table,
        type: params.col.described.type,
        number: params.col.described.number,
      },
      introspected: undefined,
      isNonNullableBasedOnAST: true,
    },
  });

  if (typedEntry === undefined) {
    return undefined;
  }

  const [, entryType] = typedEntry;

  return [params.col.described.name, { kind: "array", value: entryType }];
}

function getResolvedTargetEntryByObjectJsonTarget(params: {
  col: ColumnAnalysisResult;
  jsonTarget: NamedJsonTarget["object"];
  context: GenerateContext;
}): [string, { kind: "object"; value: ResolvedTargetEntry[] }] | undefined {
  const entries: ResolvedTargetEntry[] = [];

  for (const [key, entryTarget] of params.jsonTarget.entries) {
    switch (entryTarget.kind) {
      case "column":
        {
          const col = params.context.pgColsByTableName
            .get(entryTarget.table)
            ?.find((col) => col.colName === entryTarget.column);

          if (col === undefined) {
            return;
          }

          const typedTargetEntry = getResolvedTargetEntryByColumnJsonTarget({
            ...params,
            col: {
              described: {
                name: col.colName,
                table: col.tableOid,
                type: col.colTypeOid,
                number: col.colNum,
              },
              introspected: undefined,
              isNonNullableBasedOnAST: true,
            },
            jsonTarget: entryTarget,
          });

          if (typedTargetEntry === undefined) {
            return undefined;
          }

          const [, typedTargetEntryType] = typedTargetEntry;

          entries.push([key, typedTargetEntryType]);
        }
        break;

      case "table":
        {
          const typedTargetEntry = getResolvedTargetEntryByTableJsonTarget({
            ...params,
            jsonTarget: entryTarget,
          });

          if (typedTargetEntry === undefined) {
            return undefined;
          }

          const [, typedTargetEntryType] = typedTargetEntry;

          entries.push([key, typedTargetEntryType]);
        }
        break;

      case "object":
        {
          const typedTargetEntry = getResolvedTargetEntryByObjectJsonTarget({
            ...params,
            jsonTarget: entryTarget,
          });

          if (typedTargetEntry === undefined) {
            return undefined;
          }

          const [, value] = typedTargetEntry;

          entries.push([key, value]);
        }
        break;

      case "type":
        entries.push([key, getTsTypeFromPgType({ pgTypeName: entryTarget.type })]);
        break;

      case "type-cast":
        entries.push([key, getTsTypeFromPgType({ pgTypeName: entryTarget.type })]);
        break;
      case "array":
        {
          const typedTargetEntry = getResolvedTargetEntryByArrayTarget({
            ...params,
            jsonTarget: entryTarget,
          });

          if (typedTargetEntry === undefined) {
            return undefined;
          }

          const [, value] = typedTargetEntry;

          entries.push([key, { kind: "array", value }]);
        }
        break;
    }
  }

  return [params.col.described.name, { kind: "object", value: entries }];
}

function getTsTypeFromPgTypeOid(params: {
  pgTypes: PgTypesMap;
  pgTypeOid: number;
}): ResolvedTarget {
  const pgType = params.pgTypes.get(params.pgTypeOid);

  if (pgType === undefined) {
    return { kind: "type", value: "unknown" };
  }

  return getTsTypeFromPgType({ pgTypeName: pgType.name });
}

function getTsTypeFromPgType(params: { pgTypeName: ColType | `_${ColType}` }): ResolvedTarget {
  const { isArray, pgType } = parsePgType(params.pgTypeName);
  const tsType = defaultTypesMap.get(pgType) ?? "any";
  const property: ResolvedTarget = { kind: "type", value: tsType };

  return isArray ? { kind: "array", value: property } : property;
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
