import { LibPgQueryAST, fmap, normalizeIndent } from "@ts-safeql/shared";
import {
  isColumnStarRef,
  isColumnTableColumnRef,
  isColumnTableStarRef,
  isColumnUnknownRef,
  isSingleCell,
} from "./ast-decribe.utils";
import { ResolvedColumn, SourcesResolver, getSources } from "./ast-get-sources";
import { PgColRow, PgEnumsMaps, PgTypesMap } from "./generate";
import { FlattenedRelationWithJoins } from "./utils/get-relations-with-joins";

type ASTDescriptionOptions = {
  parsed: LibPgQueryAST.ParseResult;
  relations: FlattenedRelationWithJoins[];
  typesMap: Map<string, { override: boolean; value: string }>;
  nonNullableColumns: Set<string>;
  pgColsByTableName: Map<string, PgColRow[]>;
  pgTypes: PgTypesMap;
  pgEnums: PgEnumsMaps;
  pgFns: Map<string, string>;
};

type ASTDescriptionContext = ASTDescriptionOptions & {
  select: LibPgQueryAST.SelectStmt;
  resolver: SourcesResolver;
  resolved: WeakMap<LibPgQueryAST.Node, string>;
  toTypeScriptType: (
    params: { oid: number; baseOid: number | null } | { name: string }
  ) => ASTDescribedColumnType;
};

export type ASTDescribedColumn = { name: string; type: ASTDescribedColumnType };

export type ASTDescribedColumnType =
  | { kind: "union"; value: ASTDescribedColumnType[] }
  | { kind: "array"; value: ASTDescribedColumnType }
  | { kind: "object"; value: [string, ASTDescribedColumnType][] }
  | { kind: "type"; value: string };

export function getASTDescription(params: ASTDescriptionOptions): Map<string, ASTDescribedColumn> {
  const select = params.parsed.stmts[0]?.stmt?.SelectStmt;

  if (select === undefined) {
    return new Map();
  }

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
    resolver: getSources({
      relations: params.relations,
      select: select,
      nonNullableColumns: params.nonNullableColumns,
      pgColsByTableName: params.pgColsByTableName,
    }),
    select: select,
    resolved: new WeakMap(),
    toTypeScriptType: (
      p: { oid: number; baseOid: number | null } | { name: string }
    ): ASTDescribedColumnType => {
      if ("name" in p) {
        return { kind: "type", value: params.typesMap.get(p.name)?.value ?? "unknown" };
      }

      const typeByOid = getTypeByOid(p.oid);

      if (typeByOid.override) {
        const baseType: ASTDescribedColumnType = { kind: "type", value: typeByOid.value };
        return typeByOid.isArray ? { kind: "array", value: baseType } : baseType;
      }

      const typeByBaseOid = fmap(p.baseOid, getTypeByOid);

      if (typeByBaseOid?.override === true) {
        const baseType: ASTDescribedColumnType = { kind: "type", value: typeByBaseOid.value };
        return typeByBaseOid.isArray ? { kind: "array", value: baseType } : baseType;
      }

      const enumValue = "oid" in p ? params.pgEnums.get(p.oid) : undefined;

      if (enumValue !== undefined) {
        return {
          kind: "union",
          value: enumValue.values.map((value) => ({ kind: "type", value: `'${value}'` })),
        };
      }

      const { isArray, value } = typeByBaseOid ?? typeByOid;

      const type: ASTDescribedColumnType = { kind: "type", value: value };

      return isArray ? { kind: "array", value: type } : type;
    },
  };

  const result = select.targetList
    .map((node) => getDescribedNode({ alias: undefined, node, context }))
    .flat();

  return new Map(result.map((x) => [x.name, x]));
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

  return [];
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
        type: context.toTypeScriptType({ name: "boolean" }),
      }),
    },
  ];
}

function getDescribedSubLink({
  alias,
  context,
  node,
}: GetDescribedParamsOf<LibPgQueryAST.SubLink>): ASTDescribedColumn[] {
  return [
    {
      name: alias ?? "exists",
      type: resolveType({
        context: context,
        nullable: false,
        type: (() => {
          if (node.subLinkType === LibPgQueryAST.SubLinkType.EXISTS_SUBLINK) {
            return context.toTypeScriptType({ name: "boolean" });
          }

          return context.toTypeScriptType({ name: "unknown" });
        })(),
      }),
    },
  ];
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
    return [unknownCoalesce];
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
  const types = dedupDescribedColumnTypes(
    node.elements
      .flatMap((node) => getDescribedNode({ alias: undefined, node, context }))
      .map((x) => x.type)
  );

  return [
    {
      name: alias ?? "?column?",
      type: {
        kind: "array",
        value: isSingleCell(types) ? types[0] : { kind: "union", value: types },
      },
    },
  ];
}

function dedupDescribedColumnTypes(types: ASTDescribedColumnType[]): ASTDescribedColumnType[] {
  const result: ASTDescribedColumnType[] = [];

  for (const type of types) {
    switch (type.kind) {
      case "union":
        result.push(...dedupDescribedColumnTypes(type.value));
        break;
      case "type":
        if (!result.some((x) => x.kind === "type" && x.value === type.value)) {
          result.push(type);
        }
        break;
      case "object":
      case "array":
        result.push(type);
        break;
    }
  }

  return result;
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
  const innerDescribed = getDescribedNode({ alias: undefined, node: node.arg, context }).at(0);
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
  params: GetDescribedParamsOf<LibPgQueryAST.ResTarget>
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
  params: GetDescribedParamsOf<LibPgQueryAST.FuncCall>
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

  const pgFnValue =
    args.length === 0
      ? context.pgFns.get(name)
      : context.pgFns.get(`${name}(${args.join(", ")})`) ??
        context.pgFns.get(`${name}(any)`) ??
        context.pgFns.get(`${name}(unknown)`);

  const type = resolveType({
    context: context,
    nullable: !context.nonNullableColumns.has(name),
    type: { kind: "type", value: pgFnValue ?? "unknown" },
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

  const unknownDescribedColumn: ASTDescribedColumn = {
    name: name,
    type: context.toTypeScriptType({ name: "unknown" }),
  };

  if (node.args === undefined || !isSingleCell(node.args)) {
    return [unknownDescribedColumn];
  }

  const argNode = node.args[0];

  const cellType = getDescribedNode({ alias: undefined, node: argNode, context });

  if (cellType.length === 0) {
    return [unknownDescribedColumn];
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

    describedColumn.value.push([alias, resolveType({ context, nullable: false, type })]);
  }

  return [
    {
      name: name,
      type: describedColumn,
    },
  ];
}

function getDescribedColumnRef({
  alias,
  context,
  node,
}: GetDescribedParamsOf<LibPgQueryAST.ColumnRef>): ASTDescribedColumn[] {
  // select *
  if (isColumnStarRef(node.fields)) {
    return getDescribedColumnByResolvedColumns({
      alias: alias,
      context: context,
      resolved: context.resolver.getAllResolvedColumns(),
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
    return getDescribedColumnByResolvedColumns({
      alias: alias,
      context: context,
      resolved:
        context.resolver.getColumnsByTargetField({
          kind: "column",
          table: node.fields[0].String.sval,
          column: node.fields[1].String.sval,
        }) ?? [],
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
    return {
      name: params.alias ?? column.colName,
      type: resolveType({
        context: params.context,
        nullable: !isNotNull,
        type: params.context.toTypeScriptType({
          oid: column.colTypeOid,
          baseOid: column.colBaseTypeOid,
        }),
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
        return context.toTypeScriptType({ name: "boolean" });
      case node.bsval !== undefined:
        return context.toTypeScriptType({ name: "bytea" });
      case node.fval !== undefined:
        return context.toTypeScriptType({ name: "float8" });
      case node.isnull !== undefined:
        return context.toTypeScriptType({ name: "null" });
      case node.ival !== undefined:
        return context.toTypeScriptType({ name: "int4" });
      case node.sval !== undefined:
        return context.toTypeScriptType({ name: "text" });
      default:
        return context.toTypeScriptType({ name: "unknown" });
    }
  })();

  return [
    {
      name: alias ?? (node.boolval !== undefined ? "bool" : "?column?"),
      type: resolveType({ context, nullable: node.isnull === true, type }),
    },
  ];
}

function asNonNullableType(type: ASTDescribedColumnType): ASTDescribedColumnType {
  switch (type.kind) {
    case "object":
    case "array":
      return type;
    case "union": {
      const filtered = type.value.filter(
        (described) => described.kind !== "type" || described.value !== "null"
      );

      if (filtered.length === 0) {
        return { kind: "type", value: "unknown" };
      }

      if (filtered.length === 1) {
        return filtered[0];
      }

      return { kind: "union", value: filtered };
    }
    case "type":
      return type.value === "null" ? { kind: "type", value: "unknown" } : type;
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
  if (params.nullable) {
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

type GetDescribedParamsOf<T> = {
  alias: string | undefined;
  node: T;
  context: ASTDescriptionContext;
};
