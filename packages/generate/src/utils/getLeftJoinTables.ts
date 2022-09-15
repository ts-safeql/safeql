import { ParsedQuery } from "@ts-safeql/shared";

export function getLeftJoinTablesFromParsed(parsedQuery: ParsedQuery.Root): string[] {
  const tables = [];

  if (parsedQuery.stmts === undefined) {
    return [];
  }

  for (const stmt of parsedQuery.stmts) {
    if (stmt.stmt.SelectStmt?.fromClause === undefined) {
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

function recursiveGetJoinExpr(joinExpr: ParsedQuery.JoinExpr, tables: string[]): string[] {
  const newTables =
    joinExpr.jointype === "JOIN_LEFT" ? [...tables, joinExpr.rarg!.RangeVar!.relname] : tables;

  if (joinExpr.larg?.JoinExpr !== undefined) {
    return recursiveGetJoinExpr(joinExpr.larg.JoinExpr, newTables);
  }

  return newTables;
}
