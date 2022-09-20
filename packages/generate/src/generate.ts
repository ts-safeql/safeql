import {
  defaultTypeMapping,
  DuplicateColumnsError,
  groupBy,
  ParsedQuery,
  PostgresError,
} from "@ts-safeql/shared";
import { either } from "fp-ts";
import { Either } from "fp-ts/lib/Either";
import postgres, { PostgresError as OriginalPostgresError } from "postgres";
import "source-map-support/register";
import { ColType } from "./utils/colTypes";
import { getLeftJoinTablesFromParsed } from "./utils/getLeftJoinTables";

type CacheKey = string;

const $cacheMap: Map<
  CacheKey,
  {
    pgTypes: postgres.RowList<PgTypeRow[]>;
    pgCols: PgColRow[];
    pgColsByTableOidCache: Map<number, PgColRow[]>;
  }
> = new Map();

type JSToPostgresTypeMap = Record<string, unknown>;
type Sql = postgres.Sql<JSToPostgresTypeMap>;

export type GenerateResult = { result: string | null; stmt: postgres.Statement; query: string };
export type GenerateError = DuplicateColumnsError | PostgresError;

async function getDatabaseMetadata(sql: Sql) {
  const pgTypes = await getPgTypes(sql);
  const pgCols = await getPgCols(sql);
  const pgColsByTableOidCache = groupBy(pgCols, "tableOid");

  return { pgTypes, pgCols, pgColsByTableOidCache };
}

export async function getMetadataFromCacheOrFetch(sql: Sql, cacheKey: CacheKey) {
  const cache = $cacheMap.get(cacheKey);

  if (cache !== undefined) {
    return cache;
  }

  const cacheValue = await getDatabaseMetadata(sql);

  $cacheMap.set(cacheKey, cacheValue);

  return cacheValue;
}

export interface GenerateParams {
  sql: Sql;
  query: string;
  pgParsed: ParsedQuery.Root;
  cacheMetadata?: boolean;
  cacheKey: string;
  overrides?: Partial<{
    types: Record<string, string>;
  }>;
}

export async function generate(
  params: GenerateParams
): Promise<Either<GenerateError, GenerateResult>> {
  const { sql, query, cacheMetadata = true } = params;

  const { pgCols, pgColsByTableOidCache, pgTypes } = cacheMetadata
    ? await getMetadataFromCacheOrFetch(sql, params.cacheKey)
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

    const leftTables = getLeftJoinTablesFromParsed(params.pgParsed).map(
      (tableName) => pgCols.find((col) => col.tableName === tableName)!.tableOid
    );

    const columns = result.columns.map((col): ColumnAnalysisResult => {
      const introspected = pgColsByTableOidCache
        .get(col.table)
        ?.find((x) => x.colNum === col.number);
      return introspected === undefined ? { described: col } : { described: col, introspected };
    });

    const typesMap = { ...defaultTypeMapping, ...params.overrides?.types };

    return either.right({
      result: mapColumnAnalysisResultsToTypeLiteral({ columns, pgTypes, leftTables, typesMap }),
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

type ColumnAnalysisResult =
  | { described: postgres.Column<string> }
  | { described: postgres.Column<string>; introspected: PgColRow };

function mapColumnAnalysisResultsToTypeLiteral(params: {
  columns: ColumnAnalysisResult[];
  pgTypes: PgTypeRow[];
  leftTables: number[];
  typesMap: Record<string, string>;
}) {
  const properties = params.columns.map((col) => {
    const propertySignature = mapColumnAnalysisResultToPropertySignature({
      col,
      pgTypes: params.pgTypes,
      leftTables: params.leftTables,
      typesMap: params.typesMap,
    });

    return `${propertySignature};`;
  });

  return `{ ${properties.join(" ")} }`;
}

function buildInterfacePropertyValue(params: { key: string; value: string; isNullable: boolean }) {
  return `${params.key}: ${params.isNullable ? `Nullable<${params.value}>` : params.value}`;
}

function mapColumnAnalysisResultToPropertySignature(params: {
  col: ColumnAnalysisResult;
  pgTypes: PgTypeRow[];
  leftTables: number[];
  typesMap: Record<string, string>;
}) {
  if ("introspected" in params.col) {
    const tsType = params.typesMap[params.col.introspected.colType];
    const value = params.col.introspected.colNotNull ? tsType : `Nullable<${tsType}>`;
    const isFromLeftJoin = params.leftTables.includes(params.col.introspected.tableOid);

    return buildInterfacePropertyValue({
      key: params.col.described.name ?? params.col.introspected.colName,
      value: value,
      isNullable: isFromLeftJoin,
    });
  }

  const nonTableColumnType = getTsTypeFromPgTypeOid({
    pgTypeOid: params.col.described.type,
    pgTypes: params.pgTypes,
    typesMap: params.typesMap,
  });

  return buildInterfacePropertyValue({
    key: params.col.described.name,
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

  return isArray ? `Array<${tsType}>` : tsType;
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
