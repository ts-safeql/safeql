import type { PGlite } from "@electric-sql/pglite";
import { PostgresError as WirePostgresError } from "../shims/postgres-errors";
import type postgres from "postgres";

type PgErrorFields = {
  message?: string;
  code?: string;
  position?: string | number;
  line?: string | number;
  severity?: string;
  detail?: string;
  hint?: string;
  schema?: string;
  table?: string;
  column?: string;
};

function toWirePostgresError(error: unknown): WirePostgresError {
  if (error instanceof WirePostgresError) {
    return error;
  }

  // Anything else (incl. PGlite's own error shape) is copied field-by-field into a real
  // WirePostgresError rather than unsafely cast, so the downstream rule always sees its fields.
  const fields = (error ?? {}) as PgErrorFields;
  return new WirePostgresError({
    message: fields.message ?? String(error),
    code: fields.code,
    position: fields.position,
    line: fields.line ?? "1",
    severity: fields.severity,
    detail: fields.detail,
    hint: fields.hint,
    schema: fields.schema,
    table: fields.table,
    column: fields.column,
  });
}

// The leading SQL keyword, so non-SELECT queries don't all report command: "SELECT". Known
// limitation: a leading CTE reports "WITH" rather than the inner command — harmless here because
// safeql's generate reads the type via sql.unsafe().describe(), which never goes through this.
function commandOf(sql: string): string {
  return /^\s*(\w+)/.exec(sql)?.[1]?.toUpperCase() ?? "SELECT";
}

function toRowList<T extends readonly postgres.Row[]>(
  rows: T,
  command = "SELECT",
): postgres.RowList<T> {
  const list = rows as postgres.RowList<T>;
  list.count = rows.length;
  list.command = command;
  return list;
}

function describeQuery(db: PGlite, query: string): Promise<postgres.Statement> {
  return db
    .describeQuery(query)
    .then((description) => ({
      name: "",
      string: query,
      types: description.queryParams.map((param) => param.dataTypeID),
      columns: description.resultFields.map((field, index) => ({
        name: field.name,
        type: field.dataTypeID,
        table: 0,
        number: index + 1,
      })),
    }))
    .catch((error) => {
      throw toWirePostgresError(error);
    });
}

function createPendingQuery<T extends readonly postgres.Row[]>(
  db: PGlite,
  query: string,
  parameters: unknown[] = [],
): postgres.PendingQuery<T> {
  const pending = {
    describe(): postgres.PendingDescribeQuery {
      return describeQuery(db, query) as postgres.PendingDescribeQuery;
    },
    then<TResult1 = postgres.RowList<T>, TResult2 = never>(
      onfulfilled?: ((value: postgres.RowList<T>) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return db
        .query(query, parameters)
        .then((result) => toRowList(result.rows as unknown as T, commandOf(query)))
        .catch((error) => {
          throw toWirePostgresError(error);
        })
        .then(onfulfilled, onrejected);
    },
    // postgres.PendingQuery extends Promise, so provide catch/finally too — delegating to then
    // keeps the thenable a complete Promise for any caller that uses them.
    catch<TResult = never>(
      onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
    ) {
      return this.then(undefined, onrejected);
    },
    finally(onfinally?: (() => void) | null) {
      return this.then(
        (value) => {
          onfinally?.();
          return value;
        },
        (reason) => {
          onfinally?.();
          throw reason;
        },
      );
    },
  };

  return pending as postgres.PendingQuery<T>;
}

export function createPgliteSql(db: PGlite): postgres.Sql {
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    return db
      .sql(strings, ...values)
      .then((result) => toRowList(result.rows as postgres.Row[], commandOf(strings[0] ?? "")))
      .catch((error) => {
        throw toWirePostgresError(error);
      });
  }) as postgres.Sql;

  sql.unsafe = <T extends readonly postgres.Row[] = postgres.Row[]>(
    query: string,
    parameters?: unknown[],
  ) => createPendingQuery<T>(db, query, parameters ?? []);

  sql.end = async () => {};

  return sql;
}
