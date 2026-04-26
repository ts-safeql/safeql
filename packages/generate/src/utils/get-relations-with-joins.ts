import { assertNever } from "@ts-safeql/shared";
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

  const relName =
    joinExpr.larg?.RangeVar?.relname ??
    joinExpr.larg?.RangeFunction?.alias?.aliasname ??
    joinExpr.rarg?.RangeVar?.relname ??
    joinExpr.rarg?.RangeFunction?.alias?.aliasname;

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

function isNullableJoinedRelation(joinType: LibPgQueryAST.JoinType): boolean {
  switch (joinType) {
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
      return assertNever(joinType);
  }
}

function isNullableBaseRelation(joinType: LibPgQueryAST.JoinType): boolean {
  switch (joinType) {
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
      return assertNever(joinType);
  }
}

function hasNullableBaseRelation(
  relations: FlattenedRelationWithJoins[],
  relationName: string,
): boolean {
  return relations.some(
    (relation) => relation.relName === relationName && isNullableBaseRelation(relation.joinType),
  );
}

export function isRelationNullableDueToJoin(
  relations: FlattenedRelationWithJoins[],
  relationName: string,
): boolean {
  const joinedRelation = relations.find(
    (relation) => (relation.alias ?? relation.joinRelName) === relationName,
  );

  if (joinedRelation !== undefined) {
    return isNullableJoinedRelation(joinedRelation.joinType);
  }

  return hasNullableBaseRelation(relations, relationName);
}

export function isTableNullableDueToJoin(
  relations: FlattenedRelationWithJoins[],
  tableName: string,
): boolean {
  const joinedRelation = relations.find((relation) => relation.joinRelName === tableName);

  if (joinedRelation !== undefined) {
    return isNullableJoinedRelation(joinedRelation.joinType);
  }

  return hasNullableBaseRelation(relations, tableName);
}
