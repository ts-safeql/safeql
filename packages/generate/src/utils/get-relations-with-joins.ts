import { LibPgQueryAST } from "@ts-safeql/shared";

interface Join {
  type: LibPgQueryAST.JoinType;
  name: string;
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

function recursiveTraverseJoins(
  joins: Join[],
  joinExpr: LibPgQueryAST.JoinExpr
): {
  relName: string;
  joins: Join[];
} {
  if (joinExpr.rarg?.RangeVar !== undefined) {
    const join = { type: joinExpr.jointype, name: joinExpr.rarg.RangeVar.relname };

    if (joinExpr.larg?.JoinExpr !== undefined) {
      return recursiveTraverseJoins([join, ...joins], joinExpr.larg?.JoinExpr);
    }

    return { relName: joinExpr.larg!.RangeVar!.relname, joins: [join, ...joins] };
  }

  return { relName: joinExpr.rarg!.RangeVar!.relname, joins };
}

export interface FlattenedRelationWithJoins {
  relName: string;
  joinType: LibPgQueryAST.JoinType;
  joinRelName: string;
}

export function flattenRelationsWithJoinsMap(
  relationsWithJoinsMap: RelationsWithJoinsMap
): FlattenedRelationWithJoins[] {
  const result: {
    relName: string;
    joinType: LibPgQueryAST.JoinType;
    joinRelName: string;
  }[] = [];

  relationsWithJoinsMap.forEach((joins, relName) => {
    joins.forEach((join) => {
      result.push({ relName, joinType: join.type, joinRelName: join.name });
    });
  });

  return result;
}
