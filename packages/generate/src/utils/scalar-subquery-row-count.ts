import * as LibPgQueryAST from "@ts-safeql/sql-ast";

function getConstantInteger(node: LibPgQueryAST.Node | undefined): number | undefined {
  if (node?.A_Const?.ival !== undefined) {
    const ival = node.A_Const.ival;

    if (typeof ival === "number") {
      return ival;
    }

    if (ival.ival !== undefined) {
      return ival.ival;
    }

    // libpg-query represents `LIMIT 0` as `{ ival: {} }`
    return 0;
  }

  if (node?.TypeCast?.arg !== undefined) {
    return getConstantInteger(node.TypeCast.arg);
  }

  return undefined;
}

function hasZeroRowLimit(select: LibPgQueryAST.SelectStmt): boolean {
  const limit = getConstantInteger(select.limitCount);

  return limit !== undefined && limit <= 0;
}

function expressionContainsAggregate(
  node: LibPgQueryAST.Node,
  aggregateNames: Set<string>,
): boolean {
  if (node.TypeCast?.arg !== undefined) {
    return expressionContainsAggregate(node.TypeCast.arg, aggregateNames);
  }

  if (node.FuncCall !== undefined) {
    if (node.FuncCall.over !== undefined) {
      return false;
    }

    const funcName = node.FuncCall.funcname.at(-1)?.String?.sval?.toLowerCase();

    return funcName !== undefined && aggregateNames.has(funcName);
  }

  if (node.A_Expr !== undefined) {
    return (
      (node.A_Expr.lexpr !== undefined &&
        expressionContainsAggregate(node.A_Expr.lexpr, aggregateNames)) ||
      (node.A_Expr.rexpr !== undefined &&
        expressionContainsAggregate(node.A_Expr.rexpr, aggregateNames))
    );
  }

  if (node.CoalesceExpr !== undefined) {
    return node.CoalesceExpr.args.some((arg) => expressionContainsAggregate(arg, aggregateNames));
  }

  if (node.CaseExpr !== undefined) {
    if (
      node.CaseExpr.defresult !== undefined &&
      expressionContainsAggregate(node.CaseExpr.defresult, aggregateNames)
    ) {
      return true;
    }

    return node.CaseExpr.args.some(
      (arg) =>
        (arg.CaseWhen?.expr !== undefined &&
          expressionContainsAggregate(arg.CaseWhen.expr, aggregateNames)) ||
        (arg.CaseWhen?.result !== undefined &&
          expressionContainsAggregate(arg.CaseWhen.result, aggregateNames)),
    );
  }

  return false;
}

function expressionIsConstant(node: LibPgQueryAST.Node): boolean {
  if (node.A_Const !== undefined) {
    return node.A_Const.isnull !== true;
  }

  if (node.TypeCast?.arg !== undefined) {
    return expressionIsConstant(node.TypeCast.arg);
  }

  if (node.A_Expr !== undefined) {
    const { lexpr, rexpr } = node.A_Expr;

    return (
      (lexpr === undefined || expressionIsConstant(lexpr)) &&
      (rexpr === undefined || expressionIsConstant(rexpr))
    );
  }

  return false;
}

function caseExpressionAlwaysOneRow(
  caseExpr: LibPgQueryAST.CaseExpr,
  aggregateNames: Set<string>,
): boolean {
  if (caseExpr.defresult === undefined) {
    return false;
  }

  const branches = [...caseExpr.args.map((arg) => arg.CaseWhen?.result), caseExpr.defresult].filter(
    (node): node is LibPgQueryAST.Node => node !== undefined,
  );

  return branches.every(
    (branch) => expressionContainsAggregate(branch, aggregateNames) || expressionIsConstant(branch),
  );
}

/** True when the select is guaranteed to return exactly one row (scalar subquery cannot be "empty"). */
export function selectReturnsExactlyOneRow(
  select: LibPgQueryAST.SelectStmt,
  aggregateNames: Set<string>,
): boolean {
  if (
    (select.groupClause?.length ?? 0) > 0 ||
    select.havingClause !== undefined ||
    select.limitOffset !== undefined
  ) {
    return false;
  }

  const target = select.targetList?.[0]?.ResTarget?.val;

  if ((select.targetList?.length ?? 0) !== 1 || target === undefined) {
    return false;
  }

  if (expressionContainsAggregate(target, aggregateNames)) {
    return !hasZeroRowLimit(select);
  }

  if (select.limitCount !== undefined) {
    return false;
  }

  if ((select.fromClause?.length ?? 0) > 0 || select.whereClause !== undefined) {
    return false;
  }

  return (
    expressionIsConstant(target) ||
    (target.CaseExpr !== undefined && caseExpressionAlwaysOneRow(target.CaseExpr, aggregateNames))
  );
}
