import * as LibPgQueryAST from "@ts-safeql/sql-ast";

interface Join {
  type: LibPgQueryAST.JoinType;
  name: string;
  alias?: string;
}

export type RelationsWithJoinsMap = Map<string, Join[]>;

export function getRelationsWithJoins(parsed: LibPgQueryAST.ParseResult): RelationsWithJoinsMap {
  const results: RelationsWithJoinsMap = new Map();
  const stmt = parsed.stmts[0];

  if (stmt === undefined || stmt?.stmt?.SelectStmt?.fromClause === undefined) {
    return results;
  }

  for (const fromClause of stmt.stmt.SelectStmt.fromClause) {
    if (fromClause.JoinExpr !== undefined) {
      const { relName, joins } = recursiveTraverseJoins([], fromClause.JoinExpr);
      results.set(relName, joins);
    }
  }

  return results;
}

function recursiveGetJoinName(joinExpr: LibPgQueryAST.JoinExpr): string | undefined {
  if (joinExpr.rarg?.JoinExpr !== undefined) {
    return recursiveGetJoinName(joinExpr.rarg.JoinExpr);
  }

  return joinExpr.rarg?.RangeVar?.relname ?? joinExpr.rarg?.RangeSubselect?.alias?.aliasname;
}

function recursiveTraverseJoins(
  joins: Join[],
  joinExpr: LibPgQueryAST.JoinExpr,
): {
  relName: string;
  joins: Join[];
} {
  const joinName = recursiveGetJoinName(joinExpr);
  const aliasName = joinExpr.rarg?.RangeVar?.alias?.aliasname;

  if (joinName === undefined) {
    throw new Error("joinName is undefined");
  }

  const join: Join = { type: joinExpr.jointype, name: joinName, alias: aliasName };

  if (joinExpr.larg?.JoinExpr !== undefined) {
    return recursiveTraverseJoins([join, ...joins], joinExpr.larg?.JoinExpr);
  }

  if (joinExpr.rarg?.JoinExpr !== undefined) {
    return recursiveTraverseJoins([join, ...joins], joinExpr.rarg?.JoinExpr);
  }

  const relName = joinExpr.larg?.RangeVar?.relname ?? joinExpr.rarg?.RangeVar?.relname;

  if (relName === undefined) {
    throw new Error("relName is undefined");
  }

  return { relName, joins: [join, ...joins] };
}

export interface FlattenedRelationWithJoins {
  relName: string;
  alias: string | undefined;
  joinType: LibPgQueryAST.JoinType;
  joinRelName: string;
}

export function flattenRelationsWithJoinsMap(
  relationsWithJoinsMap: RelationsWithJoinsMap,
): FlattenedRelationWithJoins[] {
  const result: FlattenedRelationWithJoins[] = [];

  relationsWithJoinsMap.forEach((joins, relName) => {
    joins.forEach((join) => {
      result.push({ relName, joinType: join.type, joinRelName: join.name, alias: join.alias });
    });
  });

  return result;
}
