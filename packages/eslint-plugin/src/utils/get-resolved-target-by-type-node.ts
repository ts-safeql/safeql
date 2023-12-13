import { ResolvedTarget } from "@ts-safeql/generate";
import { ParserServices, TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";

type GetResolvedTargetByTypeNodeParams = {
  typeNode: TSESTree.TypeNode;
  parser: ParserServices;
  checker: ts.TypeChecker;
  reservedTypes: Set<string>;
};

export function getResolvedTargetByTypeNode(
  params: GetResolvedTargetByTypeNodeParams
): ResolvedTarget {
  if (
    params.typeNode.type === TSESTree.AST_NODE_TYPES.TSLiteralType &&
    params.typeNode.literal.type === TSESTree.AST_NODE_TYPES.Literal
  ) {
    return { kind: "type", value: `'${params.typeNode.literal.value}'` };
  }

  if (params.typeNode.type === TSESTree.AST_NODE_TYPES.TSUnionType) {
    return {
      kind: "union",
      value: params.typeNode.types.map((type) =>
        getResolvedTargetByTypeNode({ ...params, typeNode: type })
      ),
    };
  }

  if (params.typeNode.type === TSESTree.AST_NODE_TYPES.TSNullKeyword) {
    return { kind: "type", value: "null" };
  }

  if (params.typeNode.type === TSESTree.AST_NODE_TYPES.TSUndefinedKeyword) {
    return { kind: "type", value: "undefined" };
  }

  if (params.typeNode.type === TSESTree.AST_NODE_TYPES.TSTypeLiteral) {
    return {
      kind: "object",
      value: params.typeNode.members.flatMap((member) => {
        if (
          member.type !== TSESTree.AST_NODE_TYPES.TSPropertySignature ||
          member.key.type !== TSESTree.AST_NODE_TYPES.Identifier ||
          member.typeAnnotation === undefined
        ) {
          return [];
        }

        const value = getResolvedTargetByTypeNode({
          ...params,
          typeNode: member.typeAnnotation.typeAnnotation,
        });

        const key = member.optional ? `${member.key.name}?` : member.key.name;

        return [[key, value]];
      }),
    };
  }

  if (params.typeNode.type === TSESTree.AST_NODE_TYPES.TSTypeReference) {
    if (
      params.typeNode.typeName.type === TSESTree.AST_NODE_TYPES.Identifier &&
      params.reservedTypes.has(params.typeNode.typeName.name)
    ) {
      return { kind: "type", value: params.typeNode.typeName.name };
    }

    const type = params.checker.getTypeFromTypeNode(
      params.parser.esTreeNodeToTSNodeMap.get(params.typeNode)
    );

    return getTypePropertiesFromTypeReference({
      type,
      typeNode: params.typeNode,
      parser: params.parser,
      checker: params.checker,
      reservedTypes: params.reservedTypes,
    });
  }

  if (params.typeNode.type === TSESTree.AST_NODE_TYPES.TSIntersectionType) {
    return {
      kind: "object",
      value: [
        ...new Map(
          params.typeNode.types.flatMap((type) => {
            const targetEntry = getResolvedTargetByTypeNode({ ...params, typeNode: type });
            return targetEntry.kind === "object" ? targetEntry.value : [];
          })
        ).entries(),
      ],
    };
  }

  if (params.typeNode.type === TSESTree.AST_NODE_TYPES.TSArrayType) {
    return {
      kind: "array",
      value: getResolvedTargetByTypeNode({ ...params, typeNode: params.typeNode.elementType }),
    };
  }

  return {
    kind: "type",
    value: params.parser.esTreeNodeToTSNodeMap.get(params.typeNode).getText(),
  };
}

function getTypePropertiesFromTypeReference(params: {
  type: ts.Type;
  checker: ts.TypeChecker;
  parser: ParserServices;
  typeNode: TSESTree.TSTypeReference;
  reservedTypes: Set<string>;
}): ResolvedTarget {
  const { type, checker, parser, typeNode, reservedTypes } = params;

  if (type.flags === ts.TypeFlags.String) {
    return { kind: "type", value: "string" };
  }

  if (type.flags === ts.TypeFlags.Number) {
    return { kind: "type", value: "number" };
  }

  if (type.flags === ts.TypeFlags.Boolean) {
    return { kind: "type", value: "boolean" };
  }

  if (type.flags === ts.TypeFlags.Null) {
    return { kind: "type", value: "null" };
  }

  if (type.flags === ts.TypeFlags.Undefined) {
    return { kind: "type", value: "undefined" };
  }

  if (type.isLiteral()) {
    return { kind: "type", value: `'${type.value}'` };
  }

  if (type.isUnion()) {
    return {
      kind: "union",
      value: type.types.map((type) =>
        getTypePropertiesFromTypeReference({ type, typeNode, parser, checker, reservedTypes })
      ),
    };
  }

  if (type.isIntersection()) {
    return {
      kind: "object",
      value: type.types.flatMap((type) => {
        const targetEntry = getTypePropertiesFromTypeReference({
          type,
          typeNode,
          parser,
          checker,
          reservedTypes,
        });

        return targetEntry.kind === "object" ? targetEntry.value : [];
      }),
    };
  }

  if (type.symbol === undefined) {
    return { kind: "type", value: type.aliasSymbol?.escapedName.toString() ?? "unknown" };
  }

  if (type.symbol.valueDeclaration !== undefined) {
    return { kind: "type", value: type.symbol.name };
  }

  if (type.flags === ts.TypeFlags.Object) {
    const entries = type.getProperties().map((property): [string, ResolvedTarget] => {
      const propType = checker.getTypeOfSymbolAtLocation(
        property,
        parser.esTreeNodeToTSNodeMap.get(typeNode)
      );

      return [
        property.escapedName.toString(),
        getTypePropertiesFromTypeReference({
          type: propType,
          typeNode,
          parser,
          checker,
          reservedTypes,
        }),
      ];
    });
    return { kind: "object", value: entries };
  }

  return { kind: "object", value: [] };
}
