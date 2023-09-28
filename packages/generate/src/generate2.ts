import {
  DuplicateColumnsError,
  IdentiferCase,
  LibPgQueryAST,
  PostgresError,
} from "@ts-safeql/shared";
import { either } from "fp-ts";
import * as E from "fp-ts/Either";
import { parseQuerySync } from "libpg-query";
import postgres from "postgres";
import { getQueryDescription, getTSTypeFromDescriptionResult } from "./get-query-description";

type JSToPostgresTypeMap = Record<string, unknown>;
type Sql = postgres.Sql<JSToPostgresTypeMap>;

export type GenerateResult = {
  result: [string, string][] | null;
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

type PgTypesMap = any;
type PgColRow = any;
type PgEnumsMaps = any;

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
  };
}

async function generate(
  params: GenerateParams,
  cacheMap: CacheMap,
  overrideMap: OverrideMap
): Promise<either.Either<GenerateError, GenerateResult>> {
  const { sql, query, cacheKey, cacheMetadata = true } = params;

  const introspection = await getTableColumnsMap(sql);

  const parsedQuery = parseQuerySync(query) as LibPgQueryAST.ParseResult;
  const description = getQueryDescription({ parsedQuery, introspection });
  const duplicates = getDuplicateColumnIfExist(description);

  if (duplicates.length > 0) {
    return either.left(
      DuplicateColumnsError.of({
        queryText: query,
        columns: duplicates.map(([, { tableName, colName }]) =>
          [tableName, colName].filter(Boolean).join(".")
        ),
      })
    );
  }

  const result = description.map(([columnName, description]) => {
    const tsType = getTSTypeFromDescriptionResult(description);
    return [columnName, tsType];
  });

  return E.right({ result });
}

function getDuplicateColumnIfExist<T>(columns: [string, T][]) {
  const duplicate = columns.filter(([column], index) => {
    return columns.find(([c], i) => column === c && i != index)
  });

  return duplicate ?? null;
}

type PgTableColumn = {
  schemaName: SchemaName;
  tableName: TableName;
  columnName: ColumnName;
  dataType: PgDataType;
  isNotNull: boolean;
  isArray: boolean;
};

const BRAND: unique symbol = Symbol("BRAND");
type BRAND<T extends string | number | symbol> = {
  [BRAND]: {
    [k in T]: true;
  };
};

export type SchemaName = BRAND<"SchemaName"> & string;
export type TableName = BRAND<"TableName"> & string;
export type ColumnName = BRAND<"ColumnName"> & string;
export type PgDataType = BRAND<"DataType"> & string;

type Column = {
  name: ColumnName;
  dataType: PgDataType;
  isArray: boolean;
  isNotNull: boolean;
};

export type TableColumnMap = Map<SchemaName, Map<TableName, Map<ColumnName, Column>>>;

async function getTableColumnsMap(sql: Sql) {
  const query = await sql<PgTableColumn[]>`
    SELECT 
        n.nspname AS "schemaName",
        c.relname AS "tableName",
        a.attname AS "columnName",
        CASE 
            WHEN t.typname = '_int4' THEN 'int4'
            ELSE t.typname
        END AS "dataType",
        CASE 
            WHEN t.typname = '_int4' THEN true
            ELSE false
        END AS "isArray",
        a.attnotnull AS "isNotNull"
    FROM
        pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON a.attnum > 0 AND a.attrelid = c.oid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_catalog.pg_type t ON a.atttypid = t.oid
    WHERE TRUE
        AND n.nspname NOT LIKE 'pg_toast%'
        AND n.nspname NOT LIKE 'pg_temp%'
        AND n.nspname NOT LIKE 'information_schema%'
        AND n.nspname NOT LIKE 'pg_catalog%';
  `;

  const grouped: TableColumnMap = new Map();

  for (const row of query) {
    const schema = grouped.get(row.schemaName) ?? new Map();
    const table = schema.get(row.tableName) ?? new Map();

    table.set(row.columnName, {
      name: row.columnName,
      dataType: row.dataType,
      isArray: row.isArray,
      isNotNull: row.isNotNull,
    });

    schema.set(row.tableName, table);
    grouped.set(row.schemaName, schema);
  }

  return grouped;
}
