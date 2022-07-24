import postgres, { PostgresError } from "postgres";
import { getLeftJoinTables } from "../check";
import { ColType, defaultTypeMapping } from "./utils/colTypes";
import { either } from "fp-ts";
import { groupBy } from "./utils/groupBy";

let $pgTypesCache: postgres.RowList<PgTypeRow[]> | null = null;
let $pgColsCache: PgColRow[] | null = null;
let $pgColsByTableOidCache: Map<number, PgColRow[]> | null = null;

type JSToPostgresTypeMap = Record<string, unknown>;
type Sql = postgres.Sql<JSToPostgresTypeMap>;

type GenerateResult = { result: string | null; stmt: postgres.Statement };
type GenerateError = { error: string };

export async function prepareCache(sql: Sql) {
  $pgTypesCache = $pgTypesCache === null ? await getPgTypes(sql) : $pgTypesCache;
  $pgColsCache = $pgColsCache === null ? await getPgCols(sql) : $pgColsCache;
  $pgColsByTableOidCache =
    $pgColsByTableOidCache === null ? groupBy($pgColsCache, "tableOid") : $pgColsByTableOidCache;
}

export async function generate(params: {
  sql: Sql;
  query: string;
  skipCache?: boolean;
}): Promise<either.Either<GenerateError, GenerateResult>> {
  const { sql, query, skipCache = false } = params;

  if (skipCache) {
    $pgTypesCache = await getPgTypes(sql);
    $pgColsCache = await getPgCols(sql);
    $pgColsByTableOidCache = groupBy($pgColsCache, "tableOid");
  } else {
    await prepareCache(sql);
    $pgTypesCache = $pgTypesCache as NonNullable<typeof $pgTypesCache>;
    $pgColsCache = $pgColsCache as NonNullable<typeof $pgColsCache>;
    $pgColsByTableOidCache = $pgColsByTableOidCache as NonNullable<typeof $pgColsByTableOidCache>;
  }

  try {
    const result = await sql.unsafe(query, [], { prepare: true }).describe();

    if (result.columns === undefined || result.columns === null || result.columns.length === 0) {
      return either.right({ result: null, stmt: result });
    }

    const colByTableOid = $pgColsByTableOidCache;
    const colsCache = $pgColsCache;
    const pgTypes = $pgTypesCache;
    const leftTables = (await getLeftJoinTables(query)).map(
      (tableName) => colsCache.find((col) => col.tableName === tableName)!.tableOid
    );

    const colNames = result.columns.map((col) => col.name);
    const duplicateCols = colNames.filter((colName, index) => colNames.indexOf(colName) != index);

    if (duplicateCols.length > 0) {
      return either.left({ error: `duplicate columns: ${duplicateCols.join(", ")}` });
    }

    const columns = result.columns.map((col): ColumnAnalysisResult => {
      const introspected = colByTableOid.get(col.table)?.find((x) => x.colNum === col.number);
      return introspected === undefined ? { described: col } : { described: col, introspected };
    });

    return either.right({
      result: mapColumnAnalysisResultsToTypeLiteral({ columns, pgTypes, leftTables }),
      stmt: result,
    });
  } catch (e) {
    if (e instanceof PostgresError) {
      return either.left({ error: e.message, line: e.line, position: e.position });
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
}) {
  const properties = params.columns.map((col) => {
    const propertySignature = mapColumnAnalysisResultToPropertySignature({
      col,
      pgTypes: params.pgTypes,
      leftTables: params.leftTables,
    });

    return `${propertySignature};`;
  });

  return `{ ${properties.join(" ")} }`;
}

function buildInterfacePropertyValue(params: { key: string; value: string; isNullable: boolean }) {
  return `${params.key}: ${params.isNullable ? `${params.value} | null` : params.value}`;
}

function mapColumnAnalysisResultToPropertySignature(params: {
  col: ColumnAnalysisResult;
  pgTypes: PgTypeRow[];
  leftTables: number[];
}) {
  if ("introspected" in params.col) {
    const tsType = defaultTypeMapping[params.col.introspected.colType];
    const value = params.col.introspected.colNotNull ? tsType : `Nullable<${tsType}>`;
    const isFromLeftJoin = params.leftTables.includes(params.col.introspected.tableOid);

    return buildInterfacePropertyValue({
      key: params.col.described.name ?? params.col.introspected.colName,
      value: value,
      isNullable: isFromLeftJoin,
    });
  }

  const typename = params.pgTypes.find((type) => type.oid === params.col.described.type);
  const tsType =
    typename !== undefined ? defaultTypeMapping[typename.name] ?? "unknown" : "unknown";

  return buildInterfacePropertyValue({
    key: params.col.described.name,
    value: `Unknown<${tsType}>`,
    isNullable: false,
  });
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
