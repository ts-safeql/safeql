import { LibPgQueryAST } from "@ts-safeql/shared";
import { ResolvedStatement } from "./get-resolved-statement";

export type JsonTargetChild = JsonTarget | { type: "Const"; tsType: string };

export type JsonTarget =
  | {
      type: "Table";
      name: string;
      table: string;
    }
  | {
      type: "Column";
      name: string;
      table: string;
      column: string;
    }
  | {
      type: "Array";
      name: string;
      of: JsonTargetChild;
    }
  | {
      type: "Object";
      name: string;
      entries: [string, JsonTargetChild][];
    };

export type NamedJsonTarget = {
  [type in JsonTarget["type"]]: Extract<JsonTarget, { type: type }> & { type: type };
};

export function getJsonTargetTypes(
  pgParsed: LibPgQueryAST.ParseResult,
  resolvedStatement: ResolvedStatement
): JsonTarget[] {
  const collection: JsonTarget[] = [];

  for (const target of pgParsed.stmts[0].stmt?.SelectStmt?.targetList ?? []) {
    if (target.ResTarget?.val?.FuncCall === undefined) {
      continue;
    }

    const targetType = getJsonFunCallTargetType({
      funcCall: target.ResTarget.val.FuncCall,
      targetName: target.ResTarget.name,
      resolvedStatement: resolvedStatement,
    });

    if (targetType !== undefined) {
      collection.push(targetType);
    }
  }

  return collection;
}

function getJsonFunCallTargetType(params: {
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

function getJsonAggTargetTypes(params: {
  name: string;
  funcCall: LibPgQueryAST.FuncCall;
  resolvedStatement: ResolvedStatement;
}): JsonTarget | undefined {
  const { name, funcCall, resolvedStatement } = params;
  const firstArg = funcCall.args?.[0];

  if (firstArg?.ColumnRef !== undefined) {
    const targetType = getJsonColumnRefTargetTypes({
      name: name,
      columnRef: firstArg.ColumnRef,
      resolvedStatement: resolvedStatement,
    });

    if (targetType !== undefined) {
      return {
        type: "Array",
        of: targetType,
        name: name,
      };
    }

    return;
  }

  if (firstArg?.FuncCall !== undefined) {
    const targetType = getJsonFunCallTargetType({
      funcCall: firstArg.FuncCall,
      targetName: name,
      resolvedStatement: resolvedStatement,
    });

    if (targetType !== undefined) {
      return {
        type: "Array",
        of: targetType,
        name: name,
      };
    }
  }
}

function getJsonObjectTargetTypes(params: {
  name: string;
  funcCall: LibPgQueryAST.FuncCall;
  resolvedStatement: ResolvedStatement;
}): NamedJsonTarget["Object"] | undefined {
  const { name, funcCall, resolvedStatement } = params;
  const entries: NamedJsonTarget["Object"]["entries"] = [];

  if (funcCall.args === undefined) {
    return;
  }

  for (const [idx, arg] of funcCall.args.entries()) {
    // Skip values iteration
    if (idx % 2 !== 0) {
      continue;
    }

    const key = arg.A_Const?.sval?.sval;
    const value = funcCall.args[idx + 1];

    if (key === undefined || value === undefined) {
      return;
    }

    if (value.FuncCall !== undefined) {
      const funcCallType = getJsonFunCallTargetType({
        funcCall: value.FuncCall,
        targetName: key,
        resolvedStatement: resolvedStatement,
      });

      if (funcCallType !== undefined) {
        entries.push([key, funcCallType]);
      }
    }

    if (value.ColumnRef !== undefined) {
      const columnRefType = getJsonColumnRefTargetTypes({
        name: key,
        columnRef: value.ColumnRef,
        resolvedStatement: resolvedStatement,
      });

      if (columnRefType !== undefined) {
        entries.push([key, columnRefType]);
      }
    }

    if (value.A_Const !== undefined) {
      const tsType = getConstTsType(value.A_Const) ?? "any";
      entries.push([key, { type: "Const", tsType: tsType }]);
    }
  }

  return {
    type: "Object",
    entries: entries,
    name: name,
  };
}

function getJsonColumnRefTargetTypes(params: {
  name: string;
  columnRef: LibPgQueryAST.ColumnRef;
  resolvedStatement: ResolvedStatement;
}): NamedJsonTarget["Table"] | NamedJsonTarget["Column"] | undefined {
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
      case undefined:
        return fromName;
    }
  })();

  if (colName === undefined) {
    return {
      type: "Table",
      table: actualRelationName,
      name: name,
    };
  }

  return {
    type: "Column",
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

function getConstTsType(node: LibPgQueryAST.AConst | undefined) {
  const primitive = getConstPrimitiveTsType(node);

  return node?.isnull === true ? `${primitive} | null` : primitive;
}

function getConstPrimitiveTsType(node: LibPgQueryAST.AConst | undefined) {
  if (node?.boolval !== undefined) {
    return "boolean";
  }

  if (node?.bsval !== undefined) {
    return "Buffer";
  }

  if (node?.fval !== undefined) {
    return "number";
  }

  if (node?.ival) {
    return "number";
  }

  if (node?.sval) {
    return "string";
  }
}
