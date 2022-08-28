import parser from "libpg-query";

export async function getLeftJoinTables(queryText: string): Promise<string[]> {
  const parsed = await parser.parseQuery(queryText);
  const tables = [];

  for (const stmt of parsed.stmts) {
    if (!("SelectStmt" in stmt.stmt) || !("fromClause" in stmt.stmt.SelectStmt)) {
      return [];
    }

    for (const fromClause of stmt.stmt.SelectStmt.fromClause) {
      if (fromClause.JoinExpr) {
        tables.push(...recursiveGetJoinExpr(fromClause.JoinExpr, []));
      }
    }
  }

  return tables;
}

function recursiveGetJoinExpr(joinExpr: any, tables: string[]): string[] {
  const newTables =
    joinExpr.jointype === "JOIN_LEFT" ? [...tables, joinExpr.rarg.RangeVar.relname] : tables;

  if ("JoinExpr" in joinExpr.larg) {
    return recursiveGetJoinExpr(joinExpr.larg.JoinExpr, [
      ...tables,
      joinExpr.rarg.RangeVar.relname,
    ]);
  }

  return newTables;
}
