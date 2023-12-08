import { LibPgQueryAST } from "@ts-safeql/shared";

export type ResolvedStatement = {
  targets: ResolvedTarget[];
  ctes: ResolvedCTE[];
  subSelects: ResolvedSubSelect[];
  tables: ResolvedTable[];
  utils: ReturnType<typeof getResolvedStatementUtils>;
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

type ResolvedTarget =
  | { kind: "table"; table: ResolvedTable }
  | { kind: "table-star"; table: ResolvedTable }
  | { kind: "star"; tables: ResolvedTable[] }
  | { kind: "column"; table: ResolvedTable; column: string }
  | {
      kind: "function-column";
      column: string;
      targets: ResolvedTarget[];
    }
  | { kind: "arbitrary-column"; tables: ResolvedTable[]; column: string };

type NamedResolvedTarget = {
  [Kind in ResolvedTarget["kind"]]: Extract<ResolvedTarget, { kind: Kind }> & { kind: Kind };
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
  const sources: ResolvedTarget[] = [];

  if (stmt?.SelectStmt === undefined) {
    return {
      targets: [],
      ctes: [],
      subSelects: [],
      tables: [],
      utils: getResolvedStatementUtils({ targets: [] }),
    };
  }

  const context: Context = {
    stmt: stmt,
    tables: getStatementTables(stmt),
    ctes: getStatementCTEs(stmt) ?? [],
    subSelects: getStatementsSubSelects(stmt) ?? [],
  };

  for (const target of stmt.SelectStmt.targetList) {
    if (target.ResTarget?.val?.ColumnRef !== undefined) {
      sources.push(...getColumnRefOrigin({ columnRef: target.ResTarget.val.ColumnRef, context }));
    }

    if (target.ResTarget?.val?.FuncCall !== undefined) {
      sources.push(
        getFuncCallOrigin({
          name: target.ResTarget.name,
          funcCall: target.ResTarget.val.FuncCall,
          context,
        })
      );
    }
  }

  return {
    targets: sources,
    ctes: context.ctes,
    subSelects: context.subSelects,
    tables: context.tables,
    utils: getResolvedStatementUtils({ targets: sources }),
  };
}

function getColumnRefOrigin(params: {
  columnRef: LibPgQueryAST.ColumnRef;
  context: Context;
}): ResolvedTarget[] {
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
        context.ctes.find((c) => c.expression.ctename === tableName)?.sources.targets ??
        context.subSelects.find((c) => c.expression.alias?.aliasname === tableName)?.sources
          .targets ?? [{ kind: "table-star", table: context.tables[0] }]
      );
    }

    if (context.subSelects.length === 1) {
      return context.subSelects[0].sources.targets;
    }

    return [{ kind: "star", tables: context.tables }];
  }

  if (firstField.String !== undefined && secondField === undefined) {
    const tableAsTarget = context.tables.find((t) => (t.alias ?? t.name) === firstFieldString);

    if (tableAsTarget !== undefined) {
      return [{ kind: "table", table: tableAsTarget }];
    }

    return context.tables.length === 1
      ? [{ kind: "column", table: context.tables[0], column: firstField.String.sval }]
      : [{ kind: "arbitrary-column", tables: context.tables, column: firstField.String.sval }];
  }

  if (secondField?.A_Star !== undefined) {
    const nonTableSources =
      context.ctes.find((c) => c.expression.ctename === firstFieldString)?.sources ??
      context.subSelects.find((c) => c.expression.alias?.aliasname === firstFieldString)?.sources;

    if (nonTableSources !== undefined) {
      return nonTableSources.targets;
    }

    const table = context.tables.find(
      (t) => t.alias === firstFieldString || t.name === firstFieldString
    );

    if (table !== undefined) {
      return [{ kind: "table-star", table }];
    }
  }

  if (secondField?.String !== undefined) {
    const secondFieldString = secondField.String.sval;
    const table = context.tables.find(
      (t) => t.alias === firstFieldString || t.name === firstFieldString
    );

    if (table !== undefined) {
      return [{ kind: "column", table, column: secondFieldString }];
    }
  }

  return [];
}

function getFuncCallOrigin(params: {
  name: string | undefined;
  funcCall: LibPgQueryAST.FuncCall;
  context: Context;
}): NamedResolvedTarget["function-column"] {
  const name = params.name ?? concatStringNodes(params.funcCall.funcname);
  const targets: ResolvedTarget[] = [];

  for (const arg of params.funcCall?.args ?? []) {
    if (arg.ColumnRef !== undefined) {
      targets.push(...getColumnRefOrigin({ columnRef: arg.ColumnRef, context: params.context }));
    }

    if (arg.FuncCall !== undefined) {
      targets.push(
        getFuncCallOrigin({
          name: undefined,
          funcCall: arg.FuncCall,
          context: params.context,
        })
      );
    }
  }

  return {
    kind: "function-column",
    column: name,
    targets,
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

export const getResolvedStatementUtils = (stmt: Pick<ResolvedStatement, "targets">) => {
  const utils = {
    getFlatTargets: (targets = stmt.targets): ResolvedTarget[] => {
      return targets.flatMap((x): ResolvedTarget[] => {
        switch (x.kind) {
          case "table":
          case "table-star":
          case "star":
          case "arbitrary-column":
          case "column":
            return [x];
          case "function-column":
            return utils.getFlatTargets(x.targets);
        }
      });
    },
    getColumnRefOrigin: (columnRef: LibPgQueryAST.ColumnRef): ResolvedTarget | undefined => {
      const fields = columnRef.fields;
      const firstField = fields?.[0]?.String?.sval;
      const secondField = fields?.[1]?.String?.sval;
      const flatTargets = utils.getFlatTargets();

      return flatTargets.find((target) => {
        switch (target.kind) {
          case "table":
          case "table-star":
            return (target.table.alias ?? target.table.name) === firstField;
          case "column":
            if (
              secondField !== undefined &&
              (target.table.alias ?? target.table.name) !== firstField
            ) {
              return false;
            }

            return target.column === secondField;
          case "star":
          case "function-column":
          case "arbitrary-column":
            return false;
        }
      });
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
