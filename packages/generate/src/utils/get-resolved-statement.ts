import { LibPgQueryAST, isNonEmpty } from "@ts-safeql/shared";
import { ColType } from "./colTypes";
import { getConstColType } from "./get-json-target-types";

export type ResolvedStatement = {
  origins: TargetOrigin[];
  ctes: ResolvedCTE[];
  subSelects: ResolvedSubSelect[];
  tables: ResolvedTable[];
  utils: ReturnType<typeof getTargetOriginUtils>;
};

type ResolvedTable = { name: string; alias: string | undefined };

type ResolvedCTE = {
  expression: LibPgQueryAST.CommonTableExpr;
  tables: ResolvedTable[];
  sources: ResolvedStatement;
};

type ResolvedSubSelect = {
  expression: LibPgQueryAST.RangeSubselect;
  tables: ResolvedTable[];
  sources: ResolvedStatement;
};

export type TargetOrigin =
  | { kind: "table"; table: ResolvedTable; node: LibPgQueryAST.ColumnRef }
  | { kind: "table-star"; table: ResolvedTable; node: LibPgQueryAST.ColumnRef }
  | { kind: "star"; tables: ResolvedTable[]; node: LibPgQueryAST.ColumnRef }
  | { kind: "column"; table: ResolvedTable; column: string; node: LibPgQueryAST.ColumnRef }
  | { kind: "type-cast"; target: TargetOrigin; type: string; node: LibPgQueryAST.TypeCast }
  | { kind: "const-column"; column: string; type: ColType | "unknown"; node: LibPgQueryAST.AConst }
  | {
      kind: "function-column";
      column: string;
      targets: TargetOrigin[];
      node: LibPgQueryAST.FuncCall;
    }
  | {
      kind: "arbitrary-column";
      tables: ResolvedTable[];
      column: string;
      node: LibPgQueryAST.ColumnRef;
    };

type NamedTargetOrigin = {
  [Kind in TargetOrigin["kind"]]: Extract<TargetOrigin, { kind: Kind }> & { kind: Kind };
};

type Context = {
  stmt: LibPgQueryAST.Node;
  tables: ResolvedTable[];
  ctes: ResolvedCTE[];
  subSelects: ResolvedSubSelect[];
};

export function getResolvedStatementFromParseResult(
  pgParsed: LibPgQueryAST.ParseResult | undefined
): ResolvedStatement {
  return getResolvedStatement(pgParsed?.stmts[0]?.stmt);
}

export function getResolvedStatement(stmt: LibPgQueryAST.Node | undefined): ResolvedStatement {
  if (stmt?.SelectStmt === undefined) {
    return {
      origins: [],
      ctes: [],
      subSelects: [],
      tables: [],
      utils: getTargetOriginUtils({ origins: [] }),
    };
  }

  const context: Context = {
    stmt: stmt,
    tables: getStatementTables(stmt),
    ctes: getStatementCTEs(stmt) ?? [],
    subSelects: getStatementsSubSelects(stmt) ?? [],
  };

  const origins: TargetOrigin[] = [];

  for (const target of stmt.SelectStmt.targetList) {
    if (target.ResTarget?.val !== undefined) {
      origins.push(
        ...getTargetOriginByNode({
          origin: target.ResTarget.val,
          name: target.ResTarget.name,
          context,
        })
      );
    }
  }

  return {
    origins: origins,
    ctes: context.ctes,
    subSelects: context.subSelects,
    tables: context.tables,
    utils: getTargetOriginUtils({ origins: origins }),
  };
}

function getTargetOriginByNode(params: {
  name: string | undefined;
  origin: LibPgQueryAST.Node;
  context: Context;
}): TargetOrigin[] {
  if (params.origin.ColumnRef !== undefined) {
    return getColumnRefOrigin({ columnRef: params.origin.ColumnRef, context: params.context });
  }

  if (params.origin.FuncCall !== undefined) {
    return [
      getFuncCallTargetOrigins({
        name: params.name,
        funcCall: params.origin.FuncCall,
        context: params.context,
      }),
    ];
  }

  if (
    params.origin?.TypeCast?.arg !== undefined &&
    params.origin?.TypeCast?.typeName !== undefined
  ) {
    const targets = getTargetOriginByNode({
      context: params.context,
      name: params.name,
      origin: params.origin.TypeCast.arg,
    });

    if (isNonEmpty(targets)) {
      return [
        {
          kind: "type-cast",
          target: targets[0],
          type: concatStringNodes(params.origin.TypeCast.typeName.names),
          node: params.origin.TypeCast,
        },
      ];
    }
  }

  if (params.origin.SubLink?.subselect !== undefined) {
    return getTargetOriginByNode({
      name: params.name,
      origin: params.origin.SubLink.subselect,
      context: params.context,
    });
  }

  if (params.origin.SelectStmt !== undefined) {
    return getResolvedStatement(params.origin).origins;
  }

  if (params.origin.ResTarget?.val !== undefined) {
    return getTargetOriginByNode({
      name: params.name,
      origin: params.origin.ResTarget.val,
      context: params.context,
    });
  }

  if (params.origin.A_Const !== undefined) {
    return [
      {
        kind: "const-column",
        column: params.name ?? "?column?",
        type: getConstColType(params.origin.A_Const) ?? "unknown",
        node: params.origin.A_Const,
      },
    ];
  }

  return [];
}

function getColumnRefOrigin(params: {
  columnRef: LibPgQueryAST.ColumnRef;
  context: Context;
}): TargetOrigin[] {
  const { columnRef, context } = params;

  if (columnRef.fields.length === 0) {
    return [];
  }

  const firstField = columnRef.fields[0];
  const firstFieldString = firstField.String?.sval ?? "";
  const secondField = columnRef.fields[1] as LibPgQueryAST.Node | undefined;

  if (firstField.A_Star !== undefined) {
    if (context.tables.length === 1) {
      const tableName = context.tables[0].alias ?? context.tables[0].name;

      return (
        context.ctes.find((c) => c.expression.ctename === tableName)?.sources.origins ??
        context.subSelects.find((c) => c.expression.alias?.aliasname === tableName)?.sources
          .origins ?? [{ kind: "table-star", table: context.tables[0], node: columnRef }]
      );
    }

    if (context.subSelects.length === 1) {
      return context.subSelects[0].sources.origins;
    }

    return [{ kind: "star", tables: context.tables, node: columnRef }];
  }

  if (firstField.String !== undefined && secondField === undefined) {
    const tableAsTarget = context.tables.find((t) => (t.alias ?? t.name) === firstFieldString);

    if (tableAsTarget !== undefined) {
      return [{ kind: "table", table: tableAsTarget, node: columnRef }];
    }

    if (context.tables.length === 1) {
      return [
        {
          kind: "column",
          table: context.tables[0],
          column: firstField.String.sval,
          node: columnRef,
        },
      ];
    }

    const subselectAsTarget = context.subSelects.find(
      (t) => t.expression.alias?.aliasname === firstFieldString
    );

    if (subselectAsTarget !== undefined && subselectAsTarget.tables.length === 1) {
      return [
        {
          kind: "table",
          table: subselectAsTarget.tables[0],
          node: columnRef,
        },
      ];
    }

    return [
      {
        kind: "arbitrary-column",
        tables: context.tables,
        column: firstField.String.sval,
        node: columnRef,
      },
    ];
  }

  if (secondField?.A_Star !== undefined) {
    const nonTableSources =
      context.ctes.find((c) => c.expression.ctename === firstFieldString)?.sources ??
      context.subSelects.find((c) => c.expression.alias?.aliasname === firstFieldString)?.sources;

    if (nonTableSources !== undefined) {
      return nonTableSources.origins;
    }

    const table = context.tables.find(
      (t) => t.alias === firstFieldString || t.name === firstFieldString
    );

    if (table !== undefined) {
      return [{ kind: "table-star", table, node: columnRef }];
    }
  }

  if (secondField?.String !== undefined) {
    const secondFieldString = secondField.String.sval;
    const table = context.tables.find(
      (t) => t.alias === firstFieldString || t.name === firstFieldString
    );

    if (table !== undefined) {
      return [{ kind: "column", table, column: secondFieldString, node: columnRef }];
    }
  }

  return [];
}

function getFuncCallTargetOrigins(params: {
  name: string | undefined;
  funcCall: LibPgQueryAST.FuncCall;
  context: Context;
}): NamedTargetOrigin["function-column"] {
  const functionName = concatStringNodes(params.funcCall.funcname);
  const name = params.name ?? functionName;
  const targets = (params.funcCall?.args ?? []).flatMap((x, i) => {
    if (functionName.endsWith("_build_object") && i % 2 === 0) {
      return [];
    }

    return getTargetOriginByNode({
      name: undefined,
      context: params.context,
      origin: x,
    });
  });

  return {
    kind: "function-column",
    column: name,
    targets,
    node: params.funcCall,
  };
}

function getStatementsSubSelects(stmt: LibPgQueryAST.Node) {
  return stmt.SelectStmt?.fromClause?.flatMap((x) => {
    if (x.RangeSubselect === undefined) {
      return [];
    }

    return [
      {
        expression: x.RangeSubselect,
        tables: getStatementTables(x.RangeSubselect.subquery),
        sources: getResolvedStatement(x.RangeSubselect.subquery),
      },
    ];
  });
}

function getStatementCTEs(stmt: LibPgQueryAST.Node) {
  return stmt.SelectStmt?.withClause?.ctes.flatMap((x) => {
    if (x.CommonTableExpr === undefined) {
      return [];
    }

    return [
      {
        expression: x.CommonTableExpr,
        tables: getStatementTables(x.CommonTableExpr.ctequery),
        sources: getResolvedStatement(x.CommonTableExpr.ctequery),
      },
    ];
  });
}

function getStatementTables(
  pgParsed: LibPgQueryAST.Node | undefined
): { name: string; alias: string | undefined }[] {
  const tables: { name: string; alias: string | undefined }[] = [];

  if (pgParsed === undefined) {
    return tables;
  }

  if (pgParsed.JoinExpr !== undefined) {
    tables.push(...getStatementTables(pgParsed.JoinExpr.larg));
    tables.push(...getStatementTables(pgParsed.JoinExpr.rarg));
  }

  if (pgParsed.RangeVar !== undefined) {
    tables.push({
      name: pgParsed.RangeVar.relname,
      alias: pgParsed.RangeVar.alias?.aliasname,
    });
  }

  if (pgParsed.SelectStmt !== undefined) {
    for (const fromItem of pgParsed.SelectStmt.fromClause ?? []) {
      tables.push(...getStatementTables(fromItem));
    }
  }

  return tables;
}

export const getTargetOriginUtils = (stmt: Pick<ResolvedStatement, "origins">) => {
  const utils = {
    getFlatTargets: (targets = stmt.origins): TargetOrigin[] => {
      return targets
        .flatMap((x): TargetOrigin[] => {
          switch (x.kind) {
            case "table":
            case "table-star":
            case "star":
            case "arbitrary-column":
            case "column":
            case "type-cast":
            case "const-column":
              return [x];
            case "function-column":
              return utils.getFlatTargets(x.targets);
          }
        })
        .sort((a, b) => {
          const order = [
            "column",
            "table",
            "table-star",
            "star",
            "arbitrary-column",
            "function-column",
            "type-cast",
          ];

          return order.indexOf(a.kind) - order.indexOf(b.kind);
        });
    },
    getByNode: (
      node:
        | LibPgQueryAST.ColumnRef
        | LibPgQueryAST.TypeCast
        | LibPgQueryAST.AConst
        | LibPgQueryAST.FuncCall
    ): TargetOrigin | undefined => {
      return utils.getFlatTargets().find((target) => target.node === node);
    },
  };

  return utils;
};

function concatStringNodes(nodes: LibPgQueryAST.Node[] | undefined): string {
  return (
    nodes
      ?.map((x) => x.String?.sval)
      .filter(Boolean)
      .join(".") ?? ""
  );
}
