import {
  assertNever,
  defaultTypesMap,
  DuplicateColumnsError,
  fmap,
  getOrSetFromMapWithEnabled,
  groupBy,
  IdentiferCase,
  isPostgresError,
  PostgresError,
  QuerySourceMapEntry,
  toCase,
} from "@ts-safeql/shared";
import * as LibPgQueryAST from "@ts-safeql/sql-ast";
import { either } from "fp-ts";
import postgres from "postgres";
import { ASTDescribedColumn, getASTDescription } from "./ast-describe";
import { ColType } from "./utils/colTypes";
import { getNonNullableColumns } from "./utils/get-nonnullable-columns";
import {
  FlattenedRelationWithJoins,
  flattenRelationsWithJoinsMap,
  getRelationsWithJoins,
} from "./utils/get-relations-with-joins";
import * as parser from "libpg-query";

type JSToPostgresTypeMap = Record<string, unknown>;
type Sql = postgres.Sql<JSToPostgresTypeMap>;

export type ResolvedTarget =
  | { kind: "type"; value: string; type: string; base?: string }
  | { kind: "literal"; value: string; base: ResolvedTarget }
  | { kind: "union"; value: ResolvedTarget[] }
  | { kind: "array"; value: ResolvedTarget; syntax?: "array-type" | "type-reference" }
  | { kind: "object"; value: ResolvedTargetEntry[] };

export type ResolvedTargetEntry = [string, ResolvedTarget];

export type GenerateResult = {
  output: Extract<ResolvedTarget, { kind: "object" }> | null;
  unknownColumns: string[];
  stmt: postgres.Statement;
  query: { text: string; sourcemaps: QuerySourceMapEntry[] };
};
export type GenerateError = DuplicateColumnsError | PostgresError;

type CacheKey = string;
type OverrideValue = string | { parameter: string | { regex: string }; return: string };
type Overrides = {
  types: TypesMap;
  columns: Map<string, Map<string, string>>;
};

export interface GenerateParams {
  sql: Sql;
  query: { text: string; sourcemaps: QuerySourceMapEntry[] };
  cacheMetadata?: boolean;
  cacheKey: CacheKey;
  fieldTransform: IdentiferCase | undefined;
  overrides?: Partial<{
    types: Record<string, OverrideValue>;
    columns: Record<string, string>;
  }>;
}

type TypesMap = Map<string, { override: boolean; value: string }>;

type FunctionsMap = Map<string, { ts: string; pg: string }>;

type Cache = {
  base: Map<
    CacheKey,
    {
      pgTypes: PgTypesMap;
      pgCols: postgres.RowList<PgColRow[]>;
      pgEnums: PgEnumsMaps;
      pgColsByTableOidCache: Map<number, PgColRow[]>;
      pgColsBySchemaAndTableName: Map<string, Map<string, PgColRow[]>>;
      pgFnsByName: Map<string, PgFnRow[]>;
      pgTypeExprMap: Map<string, Map<string, Map<string, string>>>;
    }
  >;
  overrides: {
    types: Map<string, TypesMap>;
    columns: Map<string, Map<string, Map<string, string>>>;
  };
  functions: Map<string, FunctionsMap>;
};

function createEmptyCache(): Cache {
  return {
    base: new Map(),
    overrides: {
      types: new Map(),
      columns: new Map(),
    },
    functions: new Map(),
  };
}

export function createGenerator() {
  const cache = createEmptyCache();

  return {
    generate: (params: GenerateParams) => generate(params, cache),
    dropCacheKey: (cacheKey: CacheKey) => cache.base.delete(cacheKey),
    clearCache: () => {
      cache.base.clear();
      cache.overrides.types.clear();
      cache.overrides.columns.clear();
      cache.functions.clear();
    },
  };
}

type GenerateContext = {
  columns: ColumnAnalysisResult[];
  pgTypes: PgTypesMap;
  pgEnums: PgEnumsMaps;
  relationsWithJoins: FlattenedRelationWithJoins[];
  overrides: Overrides | undefined;
  pgColsBySchemaAndTableName: Map<string, Map<string, PgColRow[]>>;
  fieldTransform: IdentiferCase | undefined;
};

/**
 * Generates TypeScript type definitions for the result of a PostgreSQL query.
 *
 * Introspects PostgreSQL metadata and parses the SQL query AST to infer column types, nullability, and structure. Applies user-provided type and column overrides, detects duplicate columns, and returns either a detailed type mapping or an error describing issues such as duplicate columns or PostgreSQL errors.
 *
 * @param params - Query parameters and generation options, including overrides and field transforms
 * @param cache - Metadata and override cache used for performance optimization
 * @returns Either a successful result containing typed column entries and query metadata, or a detailed error if generation fails
 */
async function generate(
  params: GenerateParams,
  cache: Cache,
): Promise<either.Either<GenerateError, GenerateResult>> {
  const { sql, query, cacheKey, cacheMetadata = true } = params;

  const {
    pgColsByTableOidCache,
    pgColsBySchemaAndTableName,
    pgTypes,
    pgEnums,
    pgFnsByName,
    pgTypeExprMap,
  } = await getOrSetFromMapWithEnabled({
    shouldCache: cacheMetadata,
    map: cache.base,
    key: cacheKey,
    value: () => getDatabaseMetadata(sql),
  });

  const typesMap = await getOrSetFromMapWithEnabled({
    shouldCache: cacheMetadata,
    map: cache.overrides.types,
    key: JSON.stringify(params.overrides?.types),
    value: () => {
      const map: TypesMap = new Map([["array", { override: false, value: "array" }]]);

      for (const [key, value] of defaultTypesMap.entries()) {
        map.set(key, { override: false, value });
      }

      for (const [k, v] of Object.entries(params.overrides?.types ?? {})) {
        map.set(k, { override: true, value: typeof v === "string" ? v : v.return });
      }

      return map;
    },
  });

  const overridenColumnTypesMap = await getOrSetFromMapWithEnabled({
    shouldCache: cacheMetadata,
    map: cache.overrides.columns,
    key: JSON.stringify(params.overrides?.columns),
    value: () => {
      const map: Map<string, Map<string, string>> = new Map();

      for (const [colPath, type] of Object.entries(params.overrides?.columns ?? {})) {
        const [table, column] = colPath.split(".");

        if (table === undefined || column === undefined) {
          throw new Error(`Invalid override column key: ${colPath}. Expected format: table.column`);
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        map.has(table)
          ? map.get(table)?.set(column, type)
          : map.set(table, new Map([[column, type]]));
      }

      return map;
    },
  });

  function byReturnType(a: PgFnRow, b: PgFnRow) {
    const priority = ["numeric", "int8"];
    return priority.indexOf(a.returnType) - priority.indexOf(b.returnType);
  }

  const functionsMap = await getOrSetFromMapWithEnabled({
    shouldCache: cacheMetadata,
    map: cache.functions,
    key: JSON.stringify(params.overrides?.types),
    value: () => {
      const map: FunctionsMap = new Map();

      for (const [functionName, signatures] of pgFnsByName.entries()) {
        for (const signature of signatures.sort(byReturnType)) {
          const tsArgs = signature.arguments.map((arg) => {
            return typesMap.get(arg)?.value ?? "unknown";
          });

          const tsReturnType = typesMap.get(signature.returnType)?.value ?? signature.returnType;

          const key = tsArgs.length === 0 ? functionName : `${functionName}(${tsArgs.join(", ")})`;

          map.set(key, { ts: tsReturnType, pg: signature.returnType });
        }
      }

      return map;
    },
  });

  try {
    const result = await sql.unsafe(query.text, [], { prepare: true }).describe();

    if (result.columns === undefined || result.columns === null || result.columns.length === 0) {
      return either.right({ output: null, unknownColumns: [], stmt: result, query: query });
    }

    const duplicateCols = result.columns.filter((col, index) =>
      result.columns.find((c, i) => c.name === col.name && i != index),
    );

    if (duplicateCols.length > 0) {
      const dupes = duplicateCols.map((col) => {
        const tableCols = pgColsByTableOidCache.get(col.table);
        const tableCol =
          col.number !== 0
            ? tableCols?.at(col.number - 1)
            : tableCols?.find((c) => c.colName === col.name);

        return {
          table: tableCol?.tableName,
          column: col.name,
          originalColumn: tableCol?.colName,
        };
      });

      const dupePosition = (() => {
        const match = query.text.search(new RegExp(`\\b${duplicateCols[0].name}\\b`));
        return (match > -1 ? match : query.text.search(/SELECT/i)) + 1;
      })();

      return either.left(
        DuplicateColumnsError.of({
          queryText: query.text,
          sourcemaps: query.sourcemaps,
          position: dupePosition,
          columns: dupes.map((x) => {
            return x.column !== x.originalColumn
              ? `${x.table}.${x.originalColumn} (alias: ${x.column})`
              : `${x.table}.${x.column}`;
          }),
        }),
      );
    }

    const parsed = await parser.parse(query.text)
    const relationsWithJoins = flattenRelationsWithJoinsMap(getRelationsWithJoins(parsed));
    const nonNullableColumnsBasedOnAST = getNonNullableColumns(parsed);

    const astQueryDescription = getASTDescription({
      parsed: parsed,
      relations: relationsWithJoins,
      typesMap: typesMap,
      overridenColumnTypesMap: overridenColumnTypesMap,
      nonNullableColumns: nonNullableColumnsBasedOnAST,
      pgColsBySchemaAndTableName: pgColsBySchemaAndTableName,
      pgTypes: pgTypes,
      pgEnums: pgEnums,
      pgFns: functionsMap,
      typeExprMap: pgTypeExprMap,
    });

    const columns = result.columns.map((col, position): ColumnAnalysisResult => {
      const introspected = pgColsByTableOidCache
        .get(col.table)
        ?.find((x) => x.colNum === col.number);

      const astDescribed = astQueryDescription.get(position);

      return {
        described: col,
        astDescribed: astDescribed,
        introspected: introspected,
        isNonNullableBasedOnAST: nonNullableColumnsBasedOnAST.has(col.name),
      };
    });

    const context: GenerateContext = {
      columns,
      pgTypes,
      pgEnums,
      relationsWithJoins,
      overrides: {
        types: typesMap,
        columns: overridenColumnTypesMap,
      },
      pgColsBySchemaAndTableName,
      fieldTransform: params.fieldTransform,
    };

    return either.right({
      output: getTypedColumnEntries({ context }),
      unknownColumns: columns
        .filter((x) => x.astDescribed === undefined)
        .map((x) => x.described.name),
      stmt: result,
      query: query,
    });
  } catch (e) {
    if (isPostgresError(e)) {
      return either.left(
        PostgresError.of({
          queryText: query.text,
          sourcemaps: query.sourcemaps,
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
  const pgFns = await getPgFunctions(sql);
  const pgColsByTableOidCache = groupBy(pgCols, "tableOid");
  const pgColsBySchemaAndTableName = groupBy(pgCols, "schemaName", "tableName");
  const pgFnsByName = groupBy(pgFns, "name");
  const pgTypeExprMap = await getPgTypeExprMap(sql);

  return {
    pgTypes,
    pgCols,
    pgEnums,
    pgColsByTableOidCache,
    pgColsBySchemaAndTableName,
    pgFnsByName,
    pgTypeExprMap,
  };
}

type ColumnAnalysisResult = {
  described: postgres.Column<string>;
  astDescribed: ASTDescribedColumn | undefined;
  introspected: PgColRow | undefined;
  isNonNullableBasedOnAST: boolean;
};

function getTypedColumnEntries(params: {
  context: GenerateContext;
}): Extract<ResolvedTarget, { kind: "object" }> {
  const value = params.context.columns.map((col) =>
    getResolvedTargetEntry({ col, context: params.context }),
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
    case "literal":
      return false;
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
      ? { kind: "union", value: [params.value, { kind: "type", value: "null", type: "null" }] }
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
  if (params.col.astDescribed !== undefined) {
    return [
      toCase(params.col.described.name, params.context.fieldTransform),
      params.col.astDescribed.type,
    ];
  }

  const pgTypeOid = params.col.introspected?.colBaseTypeOid ?? params.col.described.type;

  const valueAsEnum = fmap(
    params.context.pgEnums.get(pgTypeOid),
    ({ values }): ResolvedTarget => ({
      kind: "union",
      value: values.map((x): ResolvedTarget => ({ kind: "type", value: `'${x}'`, type: "text" })),
    }),
  );

  const valueAsType = getTsTypeFromPgTypeOid({
    pgTypeOid: pgTypeOid,
    pgTypes: params.context.pgTypes,
  });

  const valueAsOverride = (() => {
    const pgType = params.context.pgTypes.get(
      params.col.introspected?.colTypeOid ?? params.col.described.type,
    );

    if (!pgType) return undefined;

    if (params.context.overrides?.columns && params.context.overrides.columns.size > 0) {
      const override = params.context.overrides.columns
        .get(params.col.introspected?.tableName ?? "")
        ?.get(params.col.described.name);

      return fmap(
        override,
        (value): ResolvedTarget => ({ kind: "type", value, type: pgType.name }),
      );
    }

    if (params.context.overrides?.types) {
      const override = params.context.overrides.types.get(pgType.name);

      return fmap(
        override,
        ({ value }): ResolvedTarget => ({ kind: "type", value, type: pgType.name }),
      );
    }

    if (params.context.overrides?.types === undefined || pgType === undefined) {
      return undefined;
    }

    const override = params.context.overrides.types.get(pgType.name);

    return fmap(
      override,
      ({ value }): ResolvedTarget => ({ kind: "type", value, type: pgType.name }),
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

function getTsTypeFromPgTypeOid(params: {
  pgTypes: PgTypesMap;
  pgTypeOid: number;
}): ResolvedTarget {
  const pgType = params.pgTypes.get(params.pgTypeOid);

  if (pgType === undefined) {
    return { kind: "type", value: "unknown", type: "unknown" };
  }

  return getTsTypeFromPgType({ pgTypeName: pgType.name });
}

function getTsTypeFromPgType(params: { pgTypeName: ColType | `_${ColType}` }): ResolvedTarget {
  const { isArray, pgType } = parsePgType(params.pgTypeName);
  const tsType = defaultTypesMap.get(pgType) ?? "any";
  const property: ResolvedTarget = { kind: "type", value: tsType, type: pgType };

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

export type PgEnumsMaps = Map<number, { name: string; values: string[] }>;

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

export type PgTypesMap = Map<number, PgTypeRow>;

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

export interface PgColRow {
  schemaName: string;
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
          pg_namespace.nspname AS "schemaName",
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
          pg_type,
          pg_namespace
      WHERE TRUE
          AND pg_attribute.attrelid = pg_class.oid
          AND pg_attribute.atttypid = pg_type.oid
          AND pg_class.relnamespace = pg_namespace.oid
          AND pg_attribute.attnum >= 1
      ORDER BY
          pg_class.relname,
          pg_attribute.attnum
  `;

  return rows;
}

export interface PgFnRow {
  name: string;
  arguments: string[];
  returnType: string;
}

async function getPgFunctions(sql: Sql) {
  const rows = await sql<{ name: string; argumentsString: string; returnType: string }[]>`
      SELECT
          pg_proc.proname AS "name",
          pg_catalog.pg_get_function_arguments(pg_proc.oid) AS "argumentsString",
          pg_type.typname AS "returnType"
      FROM
          pg_catalog.pg_proc
      JOIN
          pg_catalog.pg_type ON pg_proc.prorettype = pg_type.oid
      WHERE
          pg_proc.pronamespace::regnamespace = 'pg_catalog'::regnamespace
  `;

  return rows.map((row) => ({
    name: row.name,
    arguments: row.argumentsString
      .replace(/"/, "")
      .split(", ")
      .filter((x) => x !== ""),
    returnType: row.returnType,
  }));
}

async function getPgTypeExprMap(sql: Sql): Promise<Map<string, Map<string, Map<string, string>>>> {
  const rows = await sql<{ left: string; operator: string; right: string; result: string }[]>`
      SELECT
        l.typname as left,
        o.oprname as operator,
        r.typname as right,
        ret.typname AS result
      FROM pg_operator o
        JOIN pg_type l ON l.oid = o.oprleft
        JOIN pg_type r ON r.oid = o.oprright
        JOIN pg_type ret ON ret.oid = o.oprresult
      WHERE o.oprleft <> 0 AND o.oprright <> 0
  `;

  const map = new Map<string, Map<string, Map<string, string>>>();

  for (const row of rows) {
    const leftMap = map.get(row.left) ?? new Map<string, Map<string, string>>();
    const rightMap = leftMap.get(row.operator) ?? new Map<string, string>();
    rightMap.set(row.right, row.result);
    leftMap.set(row.operator, rightMap);
    map.set(row.left, leftMap);
  }

  return map;
}
