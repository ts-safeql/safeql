import * as LibPgQueryAST from "@ts-safeql/sql-ast";

export function isColumnStarRef(
  fields: LibPgQueryAST.Node[],
): fields is [{ A_Star: LibPgQueryAST.AStar }] {
  return isSingleCell(fields) && fields[0]?.A_Star !== undefined;
}

export function isColumnTableStarRef(
  fields: LibPgQueryAST.Node[],
): fields is [{ String: LibPgQueryAST.String }, { A_Star: LibPgQueryAST.AStar }] {
  return isTuple(fields) && fields[0].String !== undefined && fields[1].A_Star !== undefined;
}

export function isColumnUnknownRef(
  fields: LibPgQueryAST.Node[],
): fields is [{ String: LibPgQueryAST.String }] {
  return isSingleCell(fields) && fields[0].String !== undefined;
}

export function isColumnTableColumnRef(
  fields: LibPgQueryAST.Node[],
): fields is [{ String: LibPgQueryAST.String }, { String: LibPgQueryAST.String }] {
  return isTuple(fields) && fields[0].String !== undefined && fields[1].String !== undefined;
}

export function isSingleCell<T>(arr: T[]): arr is [T] {
  return arr.length === 1;
}

export function isTuple<T>(arr: T[]): arr is [T, T] {
  return arr.length === 2;
}
