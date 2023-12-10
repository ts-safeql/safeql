import { InternalError, LibPgQueryAST, isNonEmpty, normalizeIndent } from "@ts-safeql/shared";
import { ResolvedStatement } from "./get-resolved-statement";
import { ColType } from "./colTypes";

export type JsonTarget =
  | {
      kind: "type-cast";
      name: string;
      target: JsonTarget;
      type: ColType;
    }
  | {
      kind: "table";
      name: string;
      table: string;
    }
  | {
      kind: "column";
      name: string;
      table: string;
      column: string;
    }
  | {
      kind: "array";
      name: string;
      target: JsonTarget;
    }
  | {
      kind: "object";
      name: string;
      entries: [string, JsonTarget][];
    }
  | { kind: "type"; type: ColType };

export type NamedJsonTarget = {
  [Kind in JsonTarget["kind"]]: Extract<JsonTarget, { kind: Kind }> & { kind: Kind };
};

export function getJsonTargetTypes(
  pgParsed: LibPgQueryAST.ParseResult,
  resolvedStatement: ResolvedStatement
): JsonTarget[] {
  const targets: JsonTarget[] = [];

  for (const target of pgParsed.stmts[0].stmt?.SelectStmt?.targetList ?? []) {
    if (target.ResTarget?.val?.FuncCall === undefined) {
      continue;
    }

    const targetType = getFunCallJsonTarget({
      funcCall: target.ResTarget.val.FuncCall,
      targetName: target.ResTarget.name,
      resolvedStatement: resolvedStatement,
    });

    if (targetType !== undefined) {
      targets.push(targetType);
    }
  }

  return targets;
}

function getFunCallJsonTarget(params: {
  targetName: string | undefined;
  funcCall: LibPgQueryAST.FuncCall;
  resolvedStatement: ResolvedStatement;
}) {
  const functionName = concatStringNodes(params.funcCall.funcname);

  switch (functionName) {
    case "json_build_object":
    case "jsonb_build_object":
      return getJsonObjectTargetTypes({
        name: params.targetName ?? functionName,
        funcCall: params.funcCall,
        resolvedStatement: params.resolvedStatement,
      });
    case "jsonb_agg":
    case "json_agg":
      return getJsonAggTargetTypes({
        name: params.targetName ?? functionName,
        funcCall: params.funcCall,
        resolvedStatement: params.resolvedStatement,
      });
  }

  return undefined;
}

function getNodeJsonTarget(params: {
  name: string;
  node: LibPgQueryAST.Node;
  resolvedStatement: ResolvedStatement;
}): JsonTarget | undefined {
  if (params.node.FuncCall !== undefined) {
    return getFunCallJsonTarget({
      funcCall: params.node.FuncCall,
      targetName: params.name,
      resolvedStatement: params.resolvedStatement,
    });
  }

  if (params.node.ColumnRef !== undefined) {
    return getColumnRefJsonTarget({
      columnRef: params.node.ColumnRef,
      name: params.name,
      resolvedStatement: params.resolvedStatement,
    });
  }

  if (params.node.A_ArrayExpr !== undefined) {
    return getArrayExprJsonTarget({
      name: params.name,
      arrayExpr: params.node.A_ArrayExpr,
      resolvedStatement: params.resolvedStatement,
    });
  }

  if (params.node.TypeCast !== undefined) {
    return getTypeCastJsonTarget({
      name: params.name,
      typeCast: params.node.TypeCast,
      resolvedStatement: params.resolvedStatement,
    });
  }

  if (params.node.A_Const !== undefined) {
    return getConstJsonTarget(params.node.A_Const);
  }

  return undefined;
}

function getArrayExprJsonTarget(params: {
  name: string;
  arrayExpr: LibPgQueryAST.AArrayExpr;
  resolvedStatement: ResolvedStatement;
}): NamedJsonTarget["array"] | undefined {
  if (!isNonEmpty(params.arrayExpr.elements)) {
    return;
  }

  const targetType = getNodeJsonTarget({
    name: params.name,
    node: params.arrayExpr.elements[0],
    resolvedStatement: params.resolvedStatement,
  });

  if (targetType !== undefined) {
    return {
      kind: "array",
      target: targetType,
      name: params.name,
    };
  }
}
function getTypeCastJsonTarget(params: {
  name: string;
  typeCast: LibPgQueryAST.TypeCast;
  resolvedStatement: ResolvedStatement;
}): NamedJsonTarget["type-cast"] | undefined {
  const { name, typeCast, resolvedStatement } = params;

  if (typeCast.arg === undefined || typeCast.typeName === undefined) {
    return;
  }

  const targetType = getNodeJsonTarget({
    name: name,
    node: typeCast.arg,
    resolvedStatement: resolvedStatement,
  });

  const typeName = typeCast.typeName.names.at(-1)?.String?.sval ?? "text";

  if (targetType !== undefined) {
    return {
      kind: "type-cast",
      target: targetType,
      type: typeName as ColType,
      name: name,
    };
  }
}

function getJsonAggTargetTypes(params: {
  name: string;
  funcCall: LibPgQueryAST.FuncCall;
  resolvedStatement: ResolvedStatement;
}): JsonTarget | undefined {
  const { name, funcCall, resolvedStatement } = params;
  const firstArg = funcCall.args?.[0];

  if (isNonEmpty(funcCall.args)) {
    const argTarget = getNodeJsonTarget({
      name: name,
      node: funcCall.args[0],
      resolvedStatement: resolvedStatement,
    });

    if (argTarget !== undefined) {
      return {
        kind: "array",
        name: name,
        target: argTarget,
      };
    }
  }

  if (firstArg?.ColumnRef !== undefined) {
    const targetType = getColumnRefJsonTarget({
      name: name,
      columnRef: firstArg.ColumnRef,
      resolvedStatement: resolvedStatement,
    });

    if (targetType !== undefined) {
      return {
        kind: "array",
        target: targetType,
        name: name,
      };
    }

    return;
  }

  if (firstArg?.FuncCall !== undefined) {
    const targetType = getFunCallJsonTarget({
      funcCall: firstArg.FuncCall,
      targetName: name,
      resolvedStatement: resolvedStatement,
    });

    if (targetType !== undefined) {
      return {
        kind: "array",
        target: targetType,
        name: name,
      };
    }
  }
}

function getJsonObjectTargetTypes(params: {
  name: string;
  funcCall: LibPgQueryAST.FuncCall;
  resolvedStatement: ResolvedStatement;
}): NamedJsonTarget["object"] | undefined {
  const { name, funcCall, resolvedStatement } = params;
  const entries: NamedJsonTarget["object"]["entries"] = [];
  const functionName = concatStringNodes(params.funcCall.funcname);

  if (funcCall.args === undefined) {
    return;
  }

  for (const [idx, arg] of funcCall.args.entries()) {
    // Skip values iteration
    if (idx % 2 !== 0) {
      continue;
    }

    const key = arg.A_Const?.sval?.sval;
    const valueNode = funcCall.args[idx + 1];

    if (key === undefined) {
      continue;
    }

    if (valueNode === undefined) {
      if (["json_build_object", "jsonb_build_object"].includes(functionName)) {
        // TODO these types of errors should be handled better
        throw new Error(normalizeIndent`
          argument list must have even number of elements
          Hint: The arguments of ${functionName}() must consist of alternating keys and values.
        `);
      }

      continue;
    }

    const valueTarget = getNodeJsonTarget({
      name: key,
      node: valueNode,
      resolvedStatement: resolvedStatement,
    });

    entries.push([key, valueTarget ?? { kind: "type", type: "text" }]);
  }

  return {
    kind: "object",
    entries: entries,
    name: name,
  };
}

function getColumnRefJsonTarget(params: {
  name: string;
  columnRef: LibPgQueryAST.ColumnRef;
  resolvedStatement: ResolvedStatement;
}): NamedJsonTarget["table"] | NamedJsonTarget["column"] | undefined {
  const { name, columnRef, resolvedStatement } = params;
  const fields = columnRef.fields;
  const fromName = fields?.[0]?.String?.sval;
  const colName = fields?.[1]?.String?.sval;

  if (fromName === undefined) {
    return undefined;
  }

  const origin = resolvedStatement.utils.getColumnRefOrigin(columnRef);

  const actualRelationName = (() => {
    switch (origin?.kind) {
      case "table":
      case "table-star":
      case "column":
        return origin.table.name ?? fromName;
      case "star":
      case "function-column":
      case "arbitrary-column":
      case "type-cast":
      case undefined:
        return fromName;
    }
  })();

  if (colName === undefined) {
    return {
      kind: "table",
      table: actualRelationName,
      name: name,
    };
  }

  return {
    kind: "column",
    table: actualRelationName,
    column: colName,
    name: name,
  };
}

function concatStringNodes(nodes: LibPgQueryAST.Node[] | undefined): string {
  return (
    nodes
      ?.map((x) => x.String?.sval)
      .filter(Boolean)
      .join(".") ?? ""
  );
}

function getConstJsonTarget(node: LibPgQueryAST.AConst): NamedJsonTarget["type"] {
  return { kind: "type", type: getConstJsonTargetType(node) ?? "text" };
}

function getConstJsonTargetType(node: LibPgQueryAST.AConst): ColType | undefined {
  if (node?.boolval !== undefined) {
    return "bool";
  }

  if (node?.bsval !== undefined) {
    return "bit";
  }

  if (node?.fval !== undefined) {
    return "float";
  }

  if (node?.ival !== undefined) {
    return "int";
  }

  if (node?.sval !== undefined) {
    return "text";
  }
}
