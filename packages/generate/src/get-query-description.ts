import { LibPgQueryAST, defaultTypeMapping } from "@ts-safeql/shared";
import { ColumnName, SchemaName, TableColumnMap, TableName } from "./generate2";
import {
  FlattenedRelationWithJoins,
  flattenRelationsWithJoinsMap,
  getRelationsWithJoins,
} from "./utils/get-relations-with-joins";

type QueryDescriptionParams = {
  parsedQuery: LibPgQueryAST.ParseResult;
  introspection: TableColumnMap;
};

export function getQueryDescription({ introspection, parsedQuery }: QueryDescriptionParams) {
  if (parsedQuery.stmts.length !== 1) {
    throw new Error("Expected exactly one statement");
  }

  const stmt = parsedQuery.stmts[0];

  if (stmt.stmt?.SelectStmt !== undefined) {
    return getSelectStmtDescription({ introspection, parsedQuery, node: stmt.stmt.SelectStmt });
  }

  invariant(false, `TODO Implement ${Object.keys(stmt.stmt ?? {}).join(", ")}`);
}

type SelectStmtDescriptionParams = QueryDescriptionParams & {
  node: LibPgQueryAST.SelectStmt;
};

type DescriptionParamsWithNode<TNode> = QueryDescriptionParams & {
  select: LibPgQueryAST.SelectStmt;
  node: TNode;
};

type DescriptionResult = {
  colName: string;
  tableName: string | undefined;
  pgType: string;
  isArray: boolean;
  isNotNull: boolean;
};

function getSelectStmtDescription({
  introspection,
  parsedQuery,
  node,
}: SelectStmtDescriptionParams) {
  const describedTargets: [string, DescriptionResult][] = [];
  const relationsWithJoins = flattenRelationsWithJoinsMap(getRelationsWithJoins(parsedQuery));

  for (const target of node.targetList) {
    if (target.ResTarget === undefined) {
      throw new Error("Expected ResTarget");
    }

    const resTarget = target.ResTarget;

    if (resTarget.val === undefined) {
      throw new Error("Expected ResTarget.val");
    }

    const result = getResTargetDescription({
      introspection,
      parsedQuery,
      relationsWithJoins,
      select: node,
      node: resTarget,
    });

    describedTargets.push([resTarget.name ?? result.colName, result]);
  }

  return describedTargets;
}

function getResTargetDescription({
  introspection,
  parsedQuery,
  relationsWithJoins,
  select,
  node,
}: DescriptionParamsWithNode<LibPgQueryAST.ResTarget> & {
  relationsWithJoins: FlattenedRelationWithJoins[];
}): DescriptionResult {
  invariant(node.val !== undefined, "Expected ResTarget.val");

  const description = getNodeDescription({
    introspection,
    parsedQuery,
    relationsWithJoins,
    select,
    name: node.name,
    node: node.val,
  });

  invariant(description !== undefined, "Expected description");

  return description;
}

function getNodeDescription({
  introspection,
  parsedQuery,
  relationsWithJoins,
  select,
  node,
  name,
}: DescriptionParamsWithNode<LibPgQueryAST.Node> & {
  relationsWithJoins: FlattenedRelationWithJoins[];
  name: string | undefined;
}): DescriptionResult {
  if (node.A_Const !== undefined) {
    return getAConstDescription({ introspection, parsedQuery, select, name, node: node.A_Const });
  }

  if (node.ColumnRef !== undefined) {
    return getColumnRefDescription({
      introspection,
      parsedQuery,
      relationsWithJoins,
      select,
      name,
      node: node.ColumnRef,
    });
  }
}

function getColumnRefDescription({
  introspection,
  parsedQuery,
  relationsWithJoins,
  select,
  node,
  name,
}: DescriptionParamsWithNode<LibPgQueryAST.ColumnRef> & {
  relationsWithJoins: FlattenedRelationWithJoins[];
  name: string | undefined;
}): DescriptionResult {
  const colRefName = getColumnRefName({ introspection, parsedQuery, select, node: node.fields });
  const schemaName = colRefName.schema ?? ("public" as SchemaName);
  const selectedTables = getSelectedTables({
    introspection,
    parsedQuery,
    select,
    node: select,
  });

  const resolved = (() => {
    for (const table of selectedTables) {
      const introspected = introspection
        .get(schemaName)
        ?.get(colRefName.table ?? table)
        ?.get(colRefName.column);

      if (introspected !== undefined) {
        return { table: colRefName.table ?? table, introspected };
      }
    }

    invariant(false, "Expected resolved");
  })();

  // const joinType = relationsWithJoins.find((r) => r.joinRelName === resolved.table)?.joinType;

  // const isNullableDueToRelation =
  //   joinType === LibPgQueryAST.JoinType.JOIN_LEFT || joinType === LibPgQueryAST.JoinType.JOIN_FULL;

  const isNullableDueToRelation = checkIsNullableDueToRelation({
    tableSource: resolved.table,
    relationsWithJoins,
  });

  return {
    colName: name ?? colRefName.column,
    tableName: resolved.table,
    pgType: resolved.introspected.dataType,
    isArray: resolved.introspected.isArray,
    isNotNull: resolved.introspected.isNotNull && !isNullableDueToRelation,
  };
}

function checkIsNullableDueToRelation(params: {
  tableSource: TableName;
  relationsWithJoins: FlattenedRelationWithJoins[];
}) {
  const { tableSource, relationsWithJoins } = params;

  const findByJoin = relationsWithJoins.find((x) => x.joinRelName === tableSource);

  if (findByJoin !== undefined) {
    switch (findByJoin.joinType) {
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
    }
  }

  const findByRel = relationsWithJoins.filter((x) => x.relName === tableSource);

  for (const rel of findByRel) {
    switch (rel.joinType) {
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
    }
  }

  return false;
}

function isColumnFromNullableRelation({
  introspection,
  parsedQuery,
  relationsWithJoins,
}: {
  introspection: TableColumnMap;
  parsedQuery: LibPgQueryAST.ParseResult;
  relationsWithJoins: FlattenedRelationWithJoins[];
}) {}

function getSelectedTables({
  introspection,
  parsedQuery,
  select,
}: DescriptionParamsWithNode<LibPgQueryAST.SelectStmt>) {
  const tables = new Set<TableName>();

  for (const fromItem of select.fromClause) {
    if (fromItem.JoinExpr?.larg?.RangeVar?.relname !== undefined) {
      tables.add(fromItem.JoinExpr.larg.RangeVar.relname as TableName);
    }

    if (fromItem.JoinExpr?.rarg?.RangeVar?.relname !== undefined) {
      tables.add(fromItem.JoinExpr.rarg.RangeVar.relname as TableName);
    }

    if (fromItem.RangeVar?.relname !== undefined) {
      tables.add(fromItem.RangeVar.relname as TableName);
    }

    // invariant(fromItem.RangeVar !== undefined, "Expected RangeVar");
    // invariant(fromItem.RangeVar.relname !== undefined, "Expected RangeVar.relname");

    // TODO add joins
  }

  return tables;
}

function getColumnRefName({
  introspection,
  parsedQuery,
  node,
}: DescriptionParamsWithNode<LibPgQueryAST.Node[]>) {
  if (node.length === 1) {
    return {
      column: getNodeStringOrThrow(node[0]) as ColumnName,
      table: undefined,
      schema: undefined,
    };
  }

  if (node.length === 2) {
    return {
      column: getNodeStringOrThrow(node[1]) as ColumnName,
      table: getNodeStringOrThrow(node[0]) as TableName,
      schema: undefined,
    };
  }

  if (node.length === 3) {
    return {
      column: getNodeStringOrThrow(node[2]) as ColumnName,
      table: getNodeStringOrThrow(node[1]) as TableName,
      schema: getNodeStringOrThrow(node[0]) as SchemaName,
    };
  }

  throw new Error("Expected 1, 2 or 3 nodes");
}

function getNodeStringOrThrow(node: LibPgQueryAST.Node): string {
  if (node.String !== undefined) {
    return node.String.sval;
  }

  throw new Error("Expected String node");
}

function getAConstDescription({
  introspection,
  parsedQuery,
  node,
  name,
}: DescriptionParamsWithNode<LibPgQueryAST.AConst> & {
  name: string | undefined;
}): DescriptionResult {
  const colName = name ?? "?column?";

  if (node.boolval !== undefined) {
    return {
      colName: colName,
      tableName: undefined,
      pgType: "boolean",
      isArray: false,
      isNotNull: true,
    };
  }

  if (node.bsval !== undefined) {
    return {
      colName: colName,
      tableName: undefined,
      pgType: "bytea",
      isArray: false,
      isNotNull: true,
    };
  }

  if (node.fval !== undefined) {
    return {
      colName: colName,
      tableName: undefined,
      pgType: "float8",
      isArray: false,
      isNotNull: true,
    };
  }

  if (node.isnull !== undefined) {
    return {
      colName: colName,
      tableName: undefined,
      pgType: "null",
      isArray: false,
      isNotNull: false,
    };
  }

  if (node.ival !== undefined) {
    return {
      colName: colName,
      tableName: undefined,
      pgType: "int4",
      isArray: false,
      isNotNull: true,
    };
  }

  if (node.sval !== undefined) {
    return {
      colName: colName,
      tableName: undefined,
      pgType: "text",
      isArray: false,
      isNotNull: true,
    };
  }

  invariant(false, `TODO: ${JSON.stringify(node)}`);
}

function getTSTypeFromPgType(pgType: string) {
  if (pgType in defaultTypeMapping) {
    return defaultTypeMapping[pgType as keyof typeof defaultTypeMapping];
  }

  return "any";
}

export function getTSTypeFromDescriptionResult(result: DescriptionResult): string {
  let baseType: string = getTSTypeFromPgType(result.pgType);

  if (result.isArray) {
    baseType = `${baseType}[]`;
  }

  if (!result.isNotNull) {
    return baseType === "null" ? "null" : `${baseType} | null`;
  }

  return baseType;
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
