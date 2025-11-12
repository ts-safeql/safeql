import { PostgresError, QuerySourceMapEntry } from "@ts-safeql/shared";
import * as LibPgQueryAST from "@ts-safeql/sql-ast";
import { PgColRow } from "../generate";

type ParsedInsertResult = {
  stmts: (LibPgQueryAST.RawStmt & { stmt: { InsertStmt: LibPgQueryAST.InsertStmt } })[];
  version: number;
};

export function isParsedInsertResult(
  parsed: LibPgQueryAST.ParseResult,
): parsed is ParsedInsertResult {
  return parsed.stmts[0]?.stmt?.InsertStmt !== undefined;
}

export function validateInsertResult(
  parsed: ParsedInsertResult,
  pgColsBySchemaAndTableName: Map<string, Map<string, PgColRow[]>>,
  query: { text: string; sourcemaps: QuerySourceMapEntry[] },
): void {
  const insertStmt = parsed.stmts[0].stmt.InsertStmt;

  if (insertStmt.relation === undefined) {
    return;
  }

  const schemaName = insertStmt.relation.schemaname ?? "public";
  const tableName = insertStmt.relation.relname;
  const tableCols = pgColsBySchemaAndTableName.get(schemaName)?.get(tableName);

  if (tableCols === undefined) {
    return; // Table not found in metadata
  }

  const insertCols = insertStmt.cols?.map((col) => col.ResTarget?.name).filter(Boolean) ?? [];

  const missing = tableCols.filter(
    (c) => c.colNotNull && !c.colHasDef && c.colIdentity === "" && !insertCols.includes(c.colName),
  );

  if (missing.length === 0) {
    return; // No missing columns
  }

  const position = (parsed.stmts[0]?.stmtLocation ?? 0) + 1;
  const columnsStr = missing.map((c) => `"${c.colName}"`).join(", ");

  const message =
    missing.length === 1
      ? `null value in column ${columnsStr} violates not-null constraint`
      : `null value in columns ${columnsStr} violates not-null constraint`;

  const hint = `Hint: Columns ${columnsStr} are not nullable and have no default value.`;

  throw PostgresError.of({
    queryText: query.text,
    message: `${message}\n${hint}`,
    line: "1",
    position,
    sourcemaps: query.sourcemaps,
  });
}
