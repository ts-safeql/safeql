import { fmap, normalizeIndent, toCase, IdentiferCase } from "@ts-safeql/shared";
import * as LibPgQueryAST from "@ts-safeql/sql-ast";
import {
  isColumnStarRef,
  isColumnTableColumnRef,
  isColumnTableStarRef,
  isColumnUnknownRef,
  isSingleCell,
  isTuple,
} from "./ast-decribe.utils";
import { ResolvedColumn, SourcesResolver, getSources } from "./ast-get-sources";
import { PgColRow, PgEnumsMaps, PgTypesMap } from "./generate";
import { getNonNullableColumns } from "./utils/get-nonnullable-columns";
import {
  FlattenedRelationWithJoins,
  flattenRelationsWithJoinsMap,
  getRelationsWithJoins,
} from "./utils/get-relations-with-joins";

type ASTDescriptionOptions = {
  parsed: LibPgQueryAST.ParseResult;
  typesMap: Map<string, { override: boolean; value: string }>;
  typeExprMap: Map<string, Map<string, Map<string, string>>>;
  overridenColumnTypesMap: Map<string, Map<string, string>>;
  pgColsBySchemaAndTableName: Map<string, Map<string, PgColRow[]>>;
  pgTypes: PgTypesMap;
  pgEnums: PgEnumsMaps;
  pgFns: Map<string, { ts: string; pg: string }>;
  fieldTransform: IdentiferCase | undefined;
};

type ASTDescriptionContext = ASTDescriptionOptions & {
  select: LibPgQueryAST.SelectStmt;
  resolver: SourcesResolver;
  resolved: WeakMap<LibPgQueryAST.Node, string>;
  nonNullableColumns: Set<string>;
  relations: FlattenedRelationWithJoins[];
  toTypeScriptType: (
    params: { oid: number; baseOid: number | null } | { name: string },
  ) => ASTDescribedColumnType;
};

export type ASTDescribedColumn = { name: string; type: ASTDescribedColumnType };

export type ASTDescribedColumnType =
  | { kind: "union"; value: ASTDescribedColumnType[] }
  | { kind: "array"; value: ASTDescribedColumnType }
  | { kind: "object"; value: [string, ASTDescribedColumnType][] }
  | { kind: "type"; value: string; type: string; base?: string }
  | { kind: "literal"; value: string; base: ASTDescribedColumnType };

export function getASTDescription(params: ASTDescriptionOptions): {
  map: Map<number, ASTDescribedColumn | undefined>;
  meta: {
    relations: FlattenedRelationWithJoins[];
    nonNullableColumns: Set<string>;
  };
} {
  const select = params.parsed.stmts[0]?.stmt?.SelectStmt;

  if (select === undefined) {
    return {
      map: new Map(),
      meta: {
        relations: [],
        nonNullableColumns: new Set(),
      },
    };
  }

  const nonNullableColumns = getNonNullableColumns(params.parsed);
  const relations = flattenRelationsWithJoinsMap(getRelationsWithJoins(params.parsed));

  function getTypeByOid(oid: number) {
    const name = params.pgTypes.get(oid)?.name;

    if (name === undefined) {
      return { isArray: false, override: false, value: "unknown" };
    }

    const { isArray, typeName } = name.startsWith("_")
      ? { isArray: true, typeName: name.slice(1) }
      : { isArray: false, typeName: name };

    const resolvedTypeName = params.typesMap.get(typeName) ?? { override: false, value: "unknown" };

    return {
      isArray,
      override: resolvedTypeName.override,
      value: resolvedTypeName.value,
    };
  }

  const context: ASTDescriptionContext = {
    ...params,
    nonNullableColumns,
    relations,
    resolver: getSources({
      relations: relations,
      select: select,
      nonNullableColumns: nonNullableColumns,
      pgColsBySchemaAndTableName: params.pgColsBySchemaAndTableName,
    }),
    select: select,
    resolved: new WeakMap(),
    toTypeScriptType: (
      p: { oid: number; baseOid: number | null } | { name: string },
    ): ASTDescribedColumnType => {
      if ("name" in p) {
        return {
          kind: "type",
          value: params.typesMap.get(p.name)?.value ?? "unknown",
          type: p.name,
        };
      }

      const typeByOid = getTypeByOid(p.oid);

      if (typeByOid.override) {
        const baseType: ASTDescribedColumnType = {
          kind: "type",
          value: typeByOid.value,
          type: params.pgTypes.get(p.oid)?.name ?? "unknown",
        };
        return typeByOid.isArray ? { kind: "array", value: baseType } : baseType;
      }

      const typeByBaseOid = fmap(p.baseOid, getTypeByOid);

      if (typeByBaseOid?.override === true) {
        const baseType: ASTDescribedColumnType = {
          kind: "type",
          value: typeByBaseOid.value,
          type: params.pgTypes.get(p.baseOid!)?.name ?? "unknown",
        };
        return typeByBaseOid.isArray ? { kind: "array", value: baseType } : baseType;
      }

      const enumValue = "oid" in p ? params.pgEnums.get(p.oid) : undefined;

      if (enumValue !== undefined) {
        return {
          kind: "union",
          value: enumValue.values.map((value) => ({
            kind: "type",
            value: `'${value}'`,
            type: enumValue.name,
          })),
        };
      }

      const { isArray, value } = typeByBaseOid ?? typeByOid;

      const type: ASTDescribedColumnType = {
        kind: "type",
        value: value,
        type: params.pgTypes.get(p.oid)?.name ?? "unknown",
      };

      if (p.baseOid !== null) {
        type.base = params.pgTypes.get(p.baseOid)?.name;
      }

      return isArray ? { kind: "array", value: type } : type;
    },
  };

  const targetLists = [select.targetList, select.larg?.targetList, select.rarg?.targetList].filter(
    (x): x is LibPgQueryAST.Node[] => x !== undefined,
  );

  const resolvedColumnsList: (ASTDescribedColumn | undefined)[][] = [];

  for (const [targetListIdx, targetList] of targetLists.entries()) {
    resolvedColumnsList[targetListIdx] = targetList
      .map((target) => {
        const described = getDescribedNode({
          alias: undefined,
          node: target,
          context,
        });

        if (described.length === 0) {
          return [undefined];
        }

        return described;
      })
      .flat();
  }

  const columnsLength = resolvedColumnsList.reduce((acc, x) => Math.max(acc, x.length), 0);
  const final: Map<number, ASTDescribedColumn | undefined> = new Map();

  for (let i = 0; i < columnsLength; i++) {
    const result = mergeColumns(resolvedColumnsList.map((x) => x[i]));
    final.set(i, result);
  }

  return {
    map: final,
    meta: {
      relations,
      nonNullableColumns,
    },
  };
}

function mergeColumns(columns: (ASTDescribedColumn | undefined)[]): ASTDescribedColumn | undefined {
  const definedColumns = columns.filter((x) => x !== undefined);

  if (definedColumns.length === 0) {
    return undefined;
  }

  const name = definedColumns[0].name;
  const type = mergeDescribedColumnTypes(definedColumns.map((x) => x.type));

  return { name, type };
}

function getDescribedNode(params: {
  alias: string | undefined;
  node: LibPgQueryAST.Node;
  context: ASTDescriptionContext;
}): ASTDescribedColumn[] {
  const { alias, node, context } = params;

  if (node.ResTarget !== undefined) {
    return getDescribedResTarget({ alias: alias, node: node.ResTarget, context });
  }

  if (node.A_Const !== undefined) {
    return getDescribedAConst({ alias: alias, node: node.A_Const, context });
  }

  if (node.ColumnRef !== undefined) {
    return getDescribedColumnRef({ alias: alias, node: node.ColumnRef, context });
  }

  if (node.FuncCall !== undefined) {
    return getDescribedFuncCall({ alias: alias, node: node.FuncCall, context });
  }

  if (node.TypeCast !== undefined) {
    return getDescribedTypeCast({ alias: alias, node: node.TypeCast, context });
  }

  if (node.A_ArrayExpr !== undefined) {
    return getDescribedArrayExpr({ alias: alias, node: node.A_ArrayExpr, context });
  }

  if (node.CoalesceExpr !== undefined) {
    return getDescribedCoalesceExpr({ alias: alias, node: node.CoalesceExpr, context });
  }

  if (node.SubLink !== undefined) {
    return getDescribedSubLink({ alias: alias, node: node.SubLink, context });
  }

  if (node.BoolExpr !== undefined) {
    return getDescribedBoolExpr({ alias: alias, node: node.BoolExpr, context });
  }

  if (node.CaseExpr !== undefined) {
    return getDescribedCaseExpr({ alias: alias, node: node.CaseExpr, context });
  }

  if (node.NullTest !== undefined) {
    return getDescribedNullTest({ alias: alias, node: node.NullTest, context });
  }

  if (node.A_Expr !== undefined) {
    return getDescribedAExpr({ alias: alias, node: node.A_Expr, context });
  }

  if (node.SelectStmt !== undefined) {
    return getDescribedSelectStmt({ alias: alias, node: node.SelectStmt, context });
  }

  return [];
}

function getDescribedAExpr({
  alias,
  node,
  context,
}: GetDescribedParamsOf<LibPgQueryAST.AExpr>): ASTDescribedColumn[] {
  const name = alias ?? "?column?";

  if (node.lexpr === undefined && node.rexpr !== undefined) {
    const described = getDescribedNode({ alias, node: node.rexpr, context }).at(0);
    const type = fmap(described, (x) => getBaseType(x.type));

    if (type === null) return [];

    return [{ name, type }];
  }

  if (node.lexpr === undefined || node.rexpr === undefined) {
    return [];
  }

  const getResolvedNullableValueOrNull = (node: LibPgQueryAST.Node) => {
    const column = getDescribedNode({ alias: undefined, node, context }).at(0);

    if (column === undefined) return null;

    const getFromType = (
      type: ASTDescribedColumnType,
    ): { value: string; array: boolean; nullable: boolean } | null => {
      switch (true) {
        case type.kind === "type":
          return { value: type.base ?? type.type, array: false, nullable: false };

        case type.kind === "literal" && type.base.kind === "type":
          return { value: type.base.type, array: false, nullable: false };

        case type.kind === "union" && type.value.every((x) => x.kind === "literal"): {
          const resolved = getFromType(type.value[0].base);

          if (resolved === null) return null;

          return { value: resolved.value, nullable: false, array: false };
        }

        case type.kind === "union" && isTuple(type.value): {
          let nullable = false;
          let value: string | undefined = undefined;

          for (const valueType of type.value) {
            if (valueType.kind !== "type") return null;
            if (valueType.value === "null") nullable = true;
            if (valueType.value !== "null") value = valueType.type;
          }

          if (value === undefined) return null;

          return { value, nullable, array: false };
        }

        case type.kind === "object":
          return { value: "jsonb", array: false, nullable: false };

        default:
          return null;
      }
    };

    if (column.type.kind === "array") {
      const resolved = getFromType(column.type.value);

      if (!resolved) return null;

      return { value: resolved.value, nullable: resolved.nullable, array: true };
    }

    return getFromType(column.type);
  };

  const lnode = getResolvedNullableValueOrNull(node.lexpr);
  const rnode = getResolvedNullableValueOrNull(node.rexpr);
  const operator = concatStringNodes(node.name);

  if (lnode === null || rnode === null) {
    return [];
  }

  const downcast = () => {
    const left = lnode.array ? `_${lnode.value}` : lnode.value;
    const right = rnode.array ? `_${rnode.value}` : rnode.value;

    const overrides: Record<string, [string, string, string]> = {
      "int4 ^ int4": ["float8", "^", "float8"],
    };

    if (overrides[`${left} ${operator} ${right}`]) {
      return overrides[`${left} ${operator} ${right}`];
    }

    const adjust = (value: string) => (value === "varchar" ? "text" : value);

    return [adjust(left), operator, adjust(right)];
  };

  const getNullable = () => {
    if (context.nonNullableColumns.has(name)) {
      return false;
    }

    if (lnode.nullable || rnode.nullable) {
      return true;
    }

    const operatorForcesNullable =
      ["->>", "#>>"].includes(operator) && hasColumnReference(node.lexpr);

    return operatorForcesNullable;
  };

  const getType = (): ASTDescribedColumnType | undefined => {
    const nullable = getNullable();
    const [dleft, doperator, dright] = downcast();

    const type =
      context.typeExprMap.get(dleft)?.get(doperator)?.get(dright) ??
      context.typeExprMap.get("anycompatiblearray")?.get(operator)?.get("anycompatiblearray") ??
      context.typeExprMap.get("anyarray")?.get(operator)?.get("anyarray") ??
      context.typeExprMap.get(lnode.value)?.get(operator)?.values().next().value;

    if (type === undefined) {
      return;
    }

    if (type === "anycompatiblearray") {
      return {
        kind: "array",
        value: resolveType({
          context,
          nullable,
          type: context.toTypeScriptType({ name: lnode.value }),
        }),
      };
    }

    return resolveType({
      context,
      nullable,
      type: context.toTypeScriptType({ name: type }),
    });
  };

  const type = getType();

  if (type === undefined) {
    return [];
  }

  return [{ name, type }];
}

function getDescribedNullTest({
  alias,
  context,
}: GetDescribedParamsOf<LibPgQueryAST.NullTest>): ASTDescribedColumn[] {
  return [
    {
      name: alias ?? "?column?",
      type: resolveType({
        context: context,
        nullable: false,
        type: context.toTypeScriptType({ name: "bool" }),
      }),
    },
  ];
}

function getDescribedCaseExpr({
  alias,
  node,
  context,
}: GetDescribedParamsOf<LibPgQueryAST.CaseExpr>): ASTDescribedColumn[] {
  const results: ASTDescribedColumn[][] = [];

  for (const arg of node.args) {
    if (arg.CaseWhen?.result !== undefined) {
      results.push(getDescribedNode({ alias: undefined, node: arg.CaseWhen.result, context }));
    }
  }

  results.push(
    node.defresult !== undefined
      ? getDescribedNode({ alias: undefined, node: node.defresult, context })
      : [{ name: "?column?", type: context.toTypeScriptType({ name: "null" }) }],
  );

  const types = results.flat().map((x) => x.type);
  const literalsOnly = types.some((x) => x.kind !== "literal" && x.value !== "null");
  const value = mergeDescribedColumnTypes(literalsOnly ? types.map(getBaseType) : types);

  return [
    {
      name: alias ?? "case",
      type: value,
    },
  ];
}

function getBaseType(type: ASTDescribedColumnType): ASTDescribedColumnType {
  switch (type.kind) {
    case "object":
    case "union":
    case "array":
    case "type":
      return type;
    case "literal":
      return type.base;
  }
}

function getDescribedBoolExpr({
  alias,
  context,
}: GetDescribedParamsOf<LibPgQueryAST.BoolExpr>): ASTDescribedColumn[] {
  return [
    {
      name: alias ?? "?column?",
      type: resolveType({
        context: context,
        nullable: false,
        type: context.toTypeScriptType({ name: "bool" }),
      }),
    },
  ];
}

function getDescribedSubLink({
  alias,
  context,
  node,
}: GetDescribedParamsOf<LibPgQueryAST.SubLink>): ASTDescribedColumn[] {
  const getSubLinkType = (): ASTDescribedColumnType => {
    if (node.subLinkType === LibPgQueryAST.SubLinkType.EXISTS_SUBLINK) {
      return context.toTypeScriptType({ name: "bool" });
    }

    if (node.subLinkType === LibPgQueryAST.SubLinkType.EXPR_SUBLINK) {
      const described = node.subselect?.SelectStmt
        ? getDescribedNode({
            alias: undefined,
            node: { SelectStmt: node.subselect.SelectStmt },
            context,
          })
        : [];

      return described.length > 0
        ? described[0].type
        : context.toTypeScriptType({ name: "unknown" });
    }

    return context.toTypeScriptType({ name: "unknown" });
  };

  return [
    {
      name: alias ?? "exists",
      type: resolveType({
        context: context,
        nullable: false,
        type: getSubLinkType(),
      }),
    },
  ];
}

function getDescribedSelectStmt({
  alias,
  context,
  node,
}: GetDescribedParamsOf<LibPgQueryAST.SelectStmt>): ASTDescribedColumn[] {
  const subParsed: LibPgQueryAST.ParseResult = {
    version: 0,
    stmts: [{ stmt: { SelectStmt: node }, stmtLocation: 0, stmtLen: 0 }],
  };

  const subDescription = getASTDescription({
    parsed: subParsed,
    typesMap: context.typesMap,
    typeExprMap: context.typeExprMap,
    overridenColumnTypesMap: context.overridenColumnTypesMap,
    pgColsBySchemaAndTableName: context.pgColsBySchemaAndTableName,
    pgTypes: context.pgTypes,
    pgEnums: context.pgEnums,
    pgFns: context.pgFns,
    fieldTransform: context.fieldTransform,
  });

  const firstColumn = subDescription.map.get(0);
  if (firstColumn) {
    return [
      {
        name: alias ?? firstColumn.name,
        type: firstColumn.type,
      },
    ];
  }

  return [];
}

function getDescribedCoalesceExpr({
  alias,
  context,
  node,
}: GetDescribedParamsOf<LibPgQueryAST.CoalesceExpr>): ASTDescribedColumn[] {
  const firstArg = node.args.at(0);

  const unknownCoalesce: ASTDescribedColumn = {
    name: alias ?? "coalesce",
    type: context.toTypeScriptType({ name: "unknown" }),
  };

  if (firstArg === undefined) {
    return [unknownCoalesce];
  }

  const type = getDescribedNode({ alias: undefined, node: firstArg, context })
    .map((x) => asNonNullableType(x.type))
    .at(0);

  if (type === undefined) {
    return [];
  }

  return [
    {
      name: alias ?? "coalesce",
      type: type,
    },
  ];
}

function getDescribedArrayExpr({
  alias,
  context,
  node,
}: GetDescribedParamsOf<LibPgQueryAST.AArrayExpr>): ASTDescribedColumn[] {
  const types = mergeDescribedColumnTypes(
    node.elements
      .flatMap((node) => getDescribedNode({ alias: undefined, node, context }))
      .map((x) => x.type),
  );

  return [
    {
      name: alias ?? "?column?",
      type: {
        kind: "array",
        value: types,
      },
    },
  ];
}

function mergeDescribedColumnTypes(types: ASTDescribedColumnType[]): ASTDescribedColumnType {
  const result: ASTDescribedColumnType[] = [];
  const seenSymbols = new Set<string>();

  function processType(type: ASTDescribedColumnType): void {
    switch (type.kind) {
      case "union":
        type.value.forEach((subtype) => processType(subtype));
        break;

      case "type":
      case "literal":
        if (!seenSymbols.has(type.value)) {
          seenSymbols.add(type.value);
          result.push(type);
        }
        break;

      case "object":
      case "array":
        result.push(type);
        break;
    }
  }

  for (const t of types) {
    processType(t);
  }

  if (!seenSymbols.has("boolean") && seenSymbols.has("true") && seenSymbols.has("false")) {
    seenSymbols.add("boolean");
    result.push({ kind: "type", value: "boolean", type: "bool" });
  }

  if (seenSymbols.has("boolean") && (seenSymbols.has("true") || seenSymbols.has("false"))) {
    const filtered = result.filter(
      (t) => !(t.kind === "literal" && (t.value === "true" || t.value === "false")),
    );

    return isSingleCell(filtered) ? filtered[0] : { kind: "union", value: filtered };
  }

  return isSingleCell(result) ? result[0] : { kind: "union", value: result };
}

function getDescribedTypeCast({
  alias,
  context,
  node,
}: GetDescribedParamsOf<LibPgQueryAST.TypeCast>): ASTDescribedColumn[] {
  let typeName = node.typeName?.names.at(-1)?.String?.sval;

  if (typeName === "int") {
    typeName = "int4";
  }

  if (typeName === undefined || node.arg === undefined) {
    return [];
  }

  const type = context.toTypeScriptType({ name: typeName });
  const innerDescribed = getDescribedNode({ alias, node: node.arg, context }).at(0);
  const nullable = fmap(innerDescribed, (x) => isDescribedColumnNullable(x.type)) ?? true;

  switch (true) {
    case node.arg.FuncCall !== undefined: {
      return [
        {
          name: alias ?? node.arg.FuncCall?.funcname.at(-1)?.String?.sval ?? "?column?",
          type: resolveType({ context, nullable, type }),
        },
      ];
    }

    case node.arg.ColumnRef !== undefined: {
      return [
        {
          name: alias ?? concatStringNodes(node.arg.ColumnRef.fields),
          type: resolveType({ context, nullable, type }),
        },
      ];
    }

    default: {
      return [
        {
          name: alias ?? typeName ?? "?column?",
          type: resolveType({ context, nullable, type }),
        },
      ];
    }
  }
}

function getDescribedResTarget(
  params: GetDescribedParamsOf<LibPgQueryAST.ResTarget>,
): ASTDescribedColumn[] {
  const { node, context } = params;

  if (node.val === undefined) {
    return [];
  }

  return getDescribedNode({
    alias: node.name,
    context: context,
    node: node.val,
  });
}

function getDescribedFuncCall(
  params: GetDescribedParamsOf<LibPgQueryAST.FuncCall>,
): ASTDescribedColumn[] {
  const functionName = params.node.funcname.at(-1)?.String?.sval;

  if (functionName === undefined) {
    return [];
  }

  switch (true) {
    case functionName === "json_build_object":
    case functionName === "jsonb_build_object":
      return getDescribedJsonBuildObjectFunCall(params);
    case functionName === "json_agg":
    case functionName === "jsonb_agg":
      return getDescribedJsonAggFunCall(params);
    case functionName === "array_agg":
      return getDescribedArrayAggFunCall(params);
    default:
      return getDescribedFuncCallByPgFn(params);
  }
}

function getDescribedFuncCallByPgFn({
  alias,
  context,
  node,
}: GetDescribedParamsOf<LibPgQueryAST.FuncCall>): ASTDescribedColumn[] {
  const functionName = node.funcname.at(-1)?.String?.sval;
  const name = alias ?? functionName ?? "?column?";
  const args = (node.args ?? []).flatMap((node) => {
    const described = getDescribedNode({ alias: undefined, node, context }).at(0);

    if (described?.type.kind === "type") {
      return [described.type.value];
    }

    return [];
  });

  if (functionName === undefined) {
    return [{ name, type: context.toTypeScriptType({ name: "unknown" }) }];
  }

  const pgFnValue =
    args.length === 0
      ? (context.pgFns.get(functionName) ?? context.pgFns.get(`${functionName}(string)`))
      : (context.pgFns.get(`${functionName}(${args.join(", ")})`) ??
        context.pgFns.get(`${functionName}(any)`) ??
        context.pgFns.get(`${functionName}(unknown)`));

  const type = resolveType({
    context: context,
    nullable: !context.nonNullableColumns.has(name),
    type: { kind: "type", value: pgFnValue?.ts ?? "unknown", type: pgFnValue?.pg ?? "unknown" },
  });

  return [{ name, type }];
}

function getDescribedArrayAggFunCall({
  alias,
  context,
  node,
}: GetDescribedParamsOf<LibPgQueryAST.FuncCall>): ASTDescribedColumn[] {
  const name = alias ?? concatStringNodes(node.funcname);

  const firstArg = fmap(node.args?.at(0), (node) => {
    return {
      node: node,
      described: getDescribedNode({ alias: undefined, node, context }),
    };
  });

  if (firstArg === null) {
    return [
      {
        name: name,
        type: context.toTypeScriptType({ name: "unknown" }),
      },
    ];
  }

  const isSourceRef =
    context.resolver.sources.get(concatStringNodes(firstArg.node.ColumnRef?.fields)) !== undefined;

  const type = resolveType({
    context,
    nullable: !context.nonNullableColumns.has(name),
    type: {
      kind: "array",
      value:
        isSourceRef || firstArg.described.length > 1
          ? {
              kind: "object",
              value: firstArg.described.map((x) => [x.name, x.type]),
            }
          : firstArg.described[0].type,
    },
  });

  return [{ name, type }];
}

function getDescribedJsonAggFunCall({
  alias,
  context,
  node,
}: GetDescribedParamsOf<LibPgQueryAST.FuncCall>): ASTDescribedColumn[] {
  const name = alias ?? concatStringNodes(node.funcname);

  if (node.args === undefined || !isSingleCell(node.args)) {
    return [];
  }

  const argNode = node.args[0];

  const cellType = getDescribedNode({ alias: undefined, node: argNode, context });

  if (cellType.length === 0) {
    return [];
  }

  const isSourceRef =
    context.resolver.sources.get(concatStringNodes(argNode.ColumnRef?.fields)) !== undefined;

  const type = resolveType({
    context,
    nullable: !context.nonNullableColumns.has(name),
    type: {
      kind: "array",
      value:
        isSourceRef || cellType.length > 1
          ? {
              kind: "object",
              value: cellType.map((x) => [x.name, x.type]),
            }
          : cellType[0].type,
    },
  });

  return [{ name, type }];
}

function getDescribedJsonBuildObjectFunCall({
  alias,
  context,
  node,
}: GetDescribedParamsOf<LibPgQueryAST.FuncCall>): ASTDescribedColumn[] {
  const functionName = node.funcname.at(-1)?.String?.sval ?? "";
  const name = alias ?? functionName;

  const unknownDescribedColumn: ASTDescribedColumn = {
    name: name,
    type: context.toTypeScriptType({ name: "unknown" }),
  };

  if (node.args === undefined) {
    return [unknownDescribedColumn];
  }

  const describedColumn: ASTDescribedColumnType = { kind: "object", value: [] };

  for (const [idx, arg] of node.args.entries()) {
    if (idx % 2 === 1) {
      continue;
    }

    const valueNode = node.args.at(idx + 1);

    if (valueNode === undefined) {
      throw new Error(normalizeIndent`
          argument list must have even number of elements
          Hint: The arguments of ${functionName}() must consist of alternating keys and values.
        `);
    }

    const alias = arg.A_Const?.sval?.sval;
    const type = fmap(node.args[idx + 1], (node) => {
      return getDescribedNode({ alias, node, context }).at(0)?.type ?? null;
    });

    if (alias === undefined || type === null) {
      return [unknownDescribedColumn];
    }

    const transformedKey = toCase(alias, context.fieldTransform);
    describedColumn.value.push([transformedKey, resolveType({ context, nullable: false, type })]);
  }

  return [
    {
      name: name,
      type: describedColumn,
    },
  ];
}

function getColumnRefOrigins({
  context,
  node,
}: GetDescribedParamsOf<LibPgQueryAST.ColumnRef>): LibPgQueryAST.Node[] | undefined {
  if (isColumnTableStarRef(node.fields)) {
    const source = node.fields[0].String.sval;
    return (
      // lookup in cte
      context.select.withClause?.ctes.find((cte) => cte.CommonTableExpr?.ctename === source)
        ?.CommonTableExpr?.ctequery?.SelectStmt?.targetList ??
      // lookup in subselect
      context.select.fromClause
        ?.map((from) => from.RangeSubselect)
        .find((subselect) => subselect?.alias?.aliasname === source)?.subquery?.SelectStmt
        ?.targetList
    );
  }

  if (isColumnTableColumnRef(node.fields)) {
    const source = node.fields[0].String.sval;
    const column = node.fields[1].String.sval;
    const origin =
      // lookup in cte
      context.select.withClause?.ctes
        .find((cte) => cte.CommonTableExpr?.ctename === source)
        ?.CommonTableExpr?.ctequery?.SelectStmt?.targetList?.find(
          (x) => x.ResTarget?.name === column,
        ) ??
      // lookup in subselect
      context.select.fromClause
        ?.map((from) => from.RangeSubselect)
        .find((subselect) => subselect?.alias?.aliasname === source)
        ?.subquery?.SelectStmt?.targetList?.find((x) => x.ResTarget?.name === column);

    if (!origin) return undefined;

    return [origin];
  }
}

function getDescribedColumnRef({
  alias,
  context,
  node,
}: GetDescribedParamsOf<LibPgQueryAST.ColumnRef>): ASTDescribedColumn[] {
  const origins = getColumnRefOrigins({ alias, context, node })
    ?.map((origin) => getDescribedNode({ alias, node: origin, context }))
    .flat();

  if (origins) return origins;

  // select *
  if (isColumnStarRef(node.fields)) {
    return getDescribedColumnByResolvedColumns({
      alias: alias,
      context: context,
      resolved: context.resolver.getAllResolvedColumns().map((x) => x.column),
    });
  }

  // select table.*
  if (isColumnTableStarRef(node.fields)) {
    return getDescribedColumnByResolvedColumns({
      alias: alias,
      context: context,
      resolved: context.resolver.getResolvedColumnsInTable(node.fields[0].String.sval),
    });
  }

  // "select column" or "select table"
  if (isColumnUnknownRef(node.fields)) {
    const resolved = context.resolver.getColumnsByTargetField({
      kind: "unknown",
      field: node.fields[0].String.sval,
    });

    return getDescribedColumnByResolvedColumns({
      alias: alias,
      context: context,
      resolved: resolved ?? [],
    });
  }

  if (isColumnTableColumnRef(node.fields)) {
    const resolved = context.resolver.getNestedResolvedTargetField({
      kind: "column",
      table: node.fields[0].String.sval,
      column: node.fields[1].String.sval,
    });

    return getDescribedColumnByResolvedColumns({
      alias: alias,
      context: context,
      resolved: fmap(resolved, (x) => [x]) ?? [],
    });
  }

  return [];
}

function getDescribedColumnByResolvedColumns(params: {
  alias: string | undefined;
  resolved: ResolvedColumn[];
  context: ASTDescriptionContext;
}) {
  return params.resolved.map(({ column, isNotNull }) => {
    const getType = (): ASTDescribedColumnType => {
      const overridenType = params.context.overridenColumnTypesMap
        .get(column.tableName)
        ?.get(column.colName);

      if (overridenType !== undefined) {
        return {
          kind: "type",
          value: overridenType,
          type: params.context.pgTypes.get(column.colTypeOid)?.name ?? "unknown",
        };
      }

      return params.context.toTypeScriptType({
        oid: column.colTypeOid,
        baseOid: column.colBaseTypeOid,
      });
    };

    return {
      name: params.alias ?? column.colName,
      type: resolveType({
        context: params.context,
        nullable: !isNotNull,
        type: getType(),
      }),
    };
  });
}

function getDescribedAConst({
  alias,
  context,
  node,
}: GetDescribedParamsOf<LibPgQueryAST.AConst>): ASTDescribedColumn[] {
  const type = ((): ASTDescribedColumnType => {
    switch (true) {
      case node.boolval !== undefined:
        return {
          kind: "literal",
          value: node.boolval.boolval ? "true" : "false",
          base: context.toTypeScriptType({ name: "bool" }),
        };
      case node.bsval !== undefined:
        return context.toTypeScriptType({ name: "bytea" });
      case node.fval !== undefined:
        return {
          kind: "literal",
          value: node.fval.toString(),
          base: context.toTypeScriptType({ name: "float8" }),
        };
      case node.isnull !== undefined:
        return context.toTypeScriptType({ name: "null" });
      case node.ival !== undefined:
        return {
          kind: "literal",
          value: (node.ival.ival ?? 0).toString(),
          base: context.toTypeScriptType({ name: "int4" }),
        };
      case node.sval !== undefined:
        return {
          kind: "literal",
          value: `'${node.sval.sval}'`,
          base: context.toTypeScriptType({ name: "text" }),
        };
      default:
        return context.toTypeScriptType({ name: "unknown" });
    }
  })();

  return [
    {
      name: alias ?? "?column?",
      type: resolveType({ context, nullable: node.isnull === true, type }),
    },
  ];
}

function asNonNullableType(type: ASTDescribedColumnType): ASTDescribedColumnType {
  switch (type.kind) {
    case "object":
    case "array":
    case "literal":
      return type;
    case "union": {
      const filtered = type.value.filter(
        (described) => described.kind !== "type" || described.value !== "null",
      );

      if (filtered.length === 0) {
        return { kind: "type", value: "unknown", type: "unknown" };
      }

      if (filtered.length === 1) {
        return filtered[0];
      }

      return { kind: "union", value: filtered };
    }
    case "type":
      return type.value === "null" ? { kind: "type", value: "unknown", type: "unknown" } : type;
  }
}

function isDescribedColumnNullable(type: ASTDescribedColumnType): boolean {
  return type.kind === "union" && type.value.some((x) => x.kind === "type" && x.value === "null");
}

function resolveType(params: {
  type: ASTDescribedColumnType;
  nullable: boolean;
  context: ASTDescriptionContext;
}): ASTDescribedColumnType {
  if (params.nullable && params.type.value !== "null") {
    return {
      kind: "union",
      value: [params.type, params.context.toTypeScriptType({ name: "null" })],
    };
  }

  return params.type;
}

function concatStringNodes(nodes: LibPgQueryAST.Node[] | undefined): string {
  return (
    nodes
      ?.map((x) => x.String?.sval)
      .filter(Boolean)
      .join(".") ?? ""
  );
}

function hasColumnReference(node: LibPgQueryAST.Node | undefined): boolean {
  if (node === undefined) {
    return false;
  }

  if (node.ColumnRef !== undefined) {
    return true;
  }

  if (node.A_Const !== undefined) {
    return false;
  }

  if (node.TypeCast !== undefined) {
    return hasColumnReference(node.TypeCast.arg);
  }

  if (node.A_Expr !== undefined) {
    return hasColumnReference(node.A_Expr.lexpr) || hasColumnReference(node.A_Expr.rexpr);
  }

  if (node.BoolExpr !== undefined) {
    return (node.BoolExpr.args ?? []).some(hasColumnReference);
  }

  if (node.FuncCall !== undefined) {
    return (node.FuncCall.args ?? []).some(hasColumnReference);
  }

  if (node.CoalesceExpr !== undefined) {
    return node.CoalesceExpr.args.some(hasColumnReference);
  }

  if (node.CaseExpr !== undefined) {
    if (node.CaseExpr.arg && hasColumnReference(node.CaseExpr.arg)) {
      return true;
    }

    if (node.CaseExpr.defresult && hasColumnReference(node.CaseExpr.defresult)) {
      return true;
    }

    return node.CaseExpr.args.some((caseWhen) => {
      if (caseWhen.CaseWhen === undefined) {
        return false;
      }

      return (
        hasColumnReference(caseWhen.CaseWhen.expr) || hasColumnReference(caseWhen.CaseWhen.result)
      );
    });
  }

  if (node.A_ArrayExpr !== undefined) {
    return (node.A_ArrayExpr.elements ?? []).some(hasColumnReference);
  }

  if (node.SubLink !== undefined) {
    return true;
  }

  return false;
}

type GetDescribedParamsOf<T> = {
  alias: string | undefined;
  node: T;
  context: ASTDescriptionContext;
};
