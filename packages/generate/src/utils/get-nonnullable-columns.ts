import { assertNever } from "@ts-safeql/shared";
import * as LibPgQueryAST from "@ts-safeql/sql-ast";

// Function names that are always non-nullable.
const nonNullFunctions: Set<string> = new Set([
  "count",
  "now",
  "abs",
  "ceil",
  "floor",
  "round",
  "sqrt",
  "cbrt",
  "exp",
  "log",
  "log10",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "radians",
  "degrees",
  "length",
  "trim",
  "lower",
  "upper",
  "ascii",
  "concat",
  "concat_ws",
  "lpad",
  "rpad",
  "initcap",
  "left",
  "right",
  "cdat",
  "chr",
  "strpos",
  "substr",
  "translate",
  "current_date",
  "current_time",
  "current_timestamp",
  "localtime",
  "localtimestamp",
  "uuid_generate_v1",
  "uuid_generate_v4",
  "pi",
  "random",
  "exists",
  "row_number",
  "current_schema",
  "current_schemas",
  "inet_server_addr",
  "inet_server_port",
  "isfinite",
  "isnan",
  "pg_backend_pid",
  "pg_blocking_pids",
  "pg_cancel_backend",
  "pg_is_in_recovery",
  "pg_postmaster_start_time",
  "pg_relation_size",
  "pg_total_relation_size",
  "timeofday",
]);

function concatStringNodes(nodes: LibPgQueryAST.Node[] | undefined): string {
  return (
    nodes
      ?.map((x) => x.String?.sval)
      .filter(Boolean)
      .join(".") ?? ""
  );
}

function isColumnNonNullable(
  val: LibPgQueryAST.Node | undefined,
  root: LibPgQueryAST.ParseResult,
): boolean {
  if (val === undefined) {
    return false;
  }

  if (val.NullTest) {
    return true;
  }

  if (val.BoolExpr?.boolop === LibPgQueryAST.BoolExprType.NOT_EXPR) {
    return true;
  }

  if (val.A_Const) {
    return val.A_Const.isnull !== true;
  }

  if (val.FuncCall) {
    const functionName = concatStringNodes(val.FuncCall.funcname);
    return nonNullFunctions.has(functionName.toLowerCase());
  }

  if (val.TypeCast?.arg) {
    return isColumnNonNullable(val.TypeCast.arg, root);
  }

  if (val.SubLink) {
    switch (val.SubLink.subLinkType) {
      case LibPgQueryAST.SubLinkType.EXISTS_SUBLINK:
        return true;

      case LibPgQueryAST.SubLinkType.ARRAY_SUBLINK:
        return true; // while the array itself can be non-nullable, the elements can be nullable

      case LibPgQueryAST.SubLinkType.ALL_SUBLINK:
      case LibPgQueryAST.SubLinkType.ANY_SUBLINK:
      case LibPgQueryAST.SubLinkType.ROWCOMPARE_SUBLINK:
      case LibPgQueryAST.SubLinkType.EXPR_SUBLINK:
      case LibPgQueryAST.SubLinkType.MULTIEXPR_SUBLINK:
      case LibPgQueryAST.SubLinkType.CTE_SUBLINK:
        return isColumnNonNullable(val.SubLink.subselect, root);

      case LibPgQueryAST.SubLinkType.SUB_LINK_TYPE_UNDEFINED:
      case LibPgQueryAST.SubLinkType.UNRECOGNIZED:
        return false;

      default:
        assertNever(val.SubLink.subLinkType);
    }
  }

  if (val.A_Expr?.kind === LibPgQueryAST.AExprKind.AEXPR_LIKE) {
    return true;
  }

  if (val.A_Expr?.kind === LibPgQueryAST.AExprKind.AEXPR_OP) {
    return (
      isColumnNonNullable(val.A_Expr.lexpr, root) && isColumnNonNullable(val.A_Expr.rexpr, root)
    );
  }

  if (val.CaseExpr) {
    for (const when of val.CaseExpr.args) {
      if (
        !isColumnNonNullable(when.CaseWhen?.expr, root) ||
        !isColumnNonNullable(when.CaseWhen?.result, root)
      ) {
        return false;
      }
    }

    if (val.CaseExpr.defresult && !isColumnNonNullable(val.CaseExpr.defresult, root)) {
      return false;
    }

    return true;
  }

  if (val.ColumnRef) {
    const refColumnName = concatStringNodes(val.ColumnRef.fields);

    for (const stmt of root.stmts) {
      if (stmt?.stmt?.SelectStmt?.whereClause) {
        const whereClause = stmt.stmt.SelectStmt.whereClause;
        const whereClauseColumnName = concatStringNodes(
          whereClause.NullTest?.arg?.ColumnRef?.fields,
        );

        if (
          whereClause.NullTest?.nulltesttype === LibPgQueryAST.NullTestType.IS_NOT_NULL &&
          whereClauseColumnName === refColumnName
        ) {
          return true;
        }
      }
    }
  }

  if (val.CoalesceExpr) {
    for (const arg of val.CoalesceExpr.args) {
      if (isColumnNonNullable(arg, root)) {
        return true;
      }
    }
  }

  if (val.A_ArrayExpr) {
    // TODO: should we check the array elements?
    return true;
  }

  if (val.SelectStmt) {
    // TODO: maybe we should check the sublink type?
    const nonNullableColumnsInSubStmt = getNonNullableColumnsInSelectStmt(val.SelectStmt, root);
    return Array.from(nonNullableColumnsInSubStmt.values()).some(Boolean);
  }

  return false;
}

function getNodeName(node: LibPgQueryAST.Node | undefined): string {
  if (node?.ColumnRef !== undefined) {
    return concatStringNodes(node.ColumnRef.fields);
  }

  if (node?.NullTest) {
    return getNodeName(node.NullTest.arg);
  }

  if (node?.A_Const?.boolval !== undefined) {
    return "bool";
  }

  if (node?.TypeCast !== undefined) {
    const typeName = concatStringNodes(node.TypeCast.typeName?.names);

    if (typeName === "pg_catalog.interval") {
      return "interval";
    }

    if (node.TypeCast.arg) {
      return getNodeName(node.TypeCast.arg);
    }

    return typeName.replace(/^pg_catalog\./, "");
  }

  if (node?.FuncCall?.funcname !== undefined) {
    return concatStringNodes(node.FuncCall.funcname);
  }

  if (node?.SubLink?.subLinkType === LibPgQueryAST.SubLinkType.EXISTS_SUBLINK) {
    return "exists";
  }

  if (node?.SubLink?.subLinkType === LibPgQueryAST.SubLinkType.ARRAY_SUBLINK) {
    return "array";
  }

  if (node?.SubLink?.subselect?.SelectStmt?.targetList !== undefined) {
    const subSelectTargetList = node.SubLink.subselect.SelectStmt.targetList;
    if (subSelectTargetList?.[0].ResTarget !== undefined) {
      return getTargetName(subSelectTargetList[0].ResTarget);
    }
  }

  if (node?.A_ArrayExpr !== undefined) {
    return "array";
  }

  if (node?.CaseExpr !== undefined) {
    return "case";
  }

  if (node?.CoalesceExpr !== undefined) {
    return "coalesce";
  }

  return "?column?";
}

function getTargetName(target: LibPgQueryAST.ResTarget): string {
  return target.name ?? getNodeName(target.val);
}

function getNonNullableColumnsInSelectStmt(
  stmt: LibPgQueryAST.SelectStmt,
  root: LibPgQueryAST.ParseResult,
): Set<string> {
  const nonNullableColumns = new Set<string>();

  const targetList = [
    ...(stmt.targetList ?? []),
    ...(stmt.larg?.targetList ?? []),
    ...(stmt.rarg?.targetList ?? []),
  ];

  for (const target of targetList) {
    if (target.ResTarget && isColumnNonNullable(target.ResTarget.val, root)) {
      nonNullableColumns.add(getTargetName(target.ResTarget));
    }
  }

  if (stmt.whereClause) {
    if (stmt.whereClause.NullTest?.nulltesttype === LibPgQueryAST.NullTestType.IS_NOT_NULL) {
      const whereClauseName = concatStringNodes(stmt.whereClause.NullTest.arg?.ColumnRef?.fields);
      nonNullableColumns.add(whereClauseName);
    }

    if (stmt.whereClause.BoolExpr?.boolop === LibPgQueryAST.BoolExprType.AND_EXPR) {
      for (const arg of stmt.whereClause.BoolExpr.args) {
        if (
          arg.NullTest?.nulltesttype === LibPgQueryAST.NullTestType.IS_NOT_NULL &&
          arg.NullTest.arg?.ColumnRef?.fields
        ) {
          nonNullableColumns.add(concatStringNodes(arg.NullTest.arg.ColumnRef.fields));
        }
      }
    }
  }

  return nonNullableColumns;
}

export function getNonNullableColumns(root: LibPgQueryAST.ParseResult): Set<string> {
  for (const stmt of root.stmts) {
    if (stmt.stmt?.SelectStmt) {
      return getNonNullableColumnsInSelectStmt(stmt.stmt.SelectStmt, root);
    }
  }

  return new Set();
}
