import { LibPgQueryAST } from "@ts-safeql/shared";

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
]);

function isColumnNonNullable(val: LibPgQueryAST.Node): boolean {
  if (val.A_Const) {
    return val.A_Const.isnull !== true;
  }

  if (val.FuncCall) {
    const functionName = val.FuncCall.funcname.reduce((acc, curr) => acc + curr.String?.sval, "");
    return nonNullFunctions.has(functionName.toLowerCase());
  }

  if (val.TypeCast?.arg) {
    return isColumnNonNullable(val.TypeCast.arg);
  }

  return false;
}

export function getNonNullableColumns(root: LibPgQueryAST.ParseResult): boolean[] {
  const columnNullability = [];

  for (const stmt of root.stmts) {
    if (stmt?.stmt?.SelectStmt?.targetList) {
      for (const target of stmt.stmt.SelectStmt.targetList) {
        if (target.ResTarget?.val) {
          const nonNullableResult = isColumnNonNullable(target.ResTarget.val);
          columnNullability.push(nonNullableResult);
        }
      }
    }
  }

  return columnNullability;
}
