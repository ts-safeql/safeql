import { ParserServices, TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";

type GetResolvedTargetByTypeNodeParams = {
  typeNode: TSESTree.TypeNode;
  parser: ParserServices;
  checker: ts.TypeChecker;
  reservedTypes: Set<string>;
};

export type ExpectedResolvedTarget =
  | { kind: "type"; value: string; base?: string }
  | { kind: "literal"; value: string; base: ExpectedResolvedTarget }
  | { kind: "union"; value: ExpectedResolvedTarget[] }
  | { kind: "array"; value: ExpectedResolvedTarget; syntax?: "array-type" | "type-reference" }
  | { kind: "object"; value: ExpectedResolvedTargetEntry[] };

export type ExpectedResolvedTargetEntry = [string, ExpectedResolvedTarget];

export function getResolvedTargetByTypeNode(
  params: GetResolvedTargetByTypeNodeParams,
): ExpectedResolvedTarget {
  const asText = params.parser.esTreeNodeToTSNodeMap.get(params.typeNode).getText();

  if (params.reservedTypes.has(asText)) {
    return { kind: "type", value: asText };
  }

  if (params.reservedTypes.has(`${asText}[]`)) {
    return { kind: "array", value: { kind: "type", value: asText } };
  }

  if (params.reservedTypes.has(`${asText}[]`)) {
    return { kind: "array", value: { kind: "type", value: asText } };
  }

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
        getResolvedTargetByTypeNode({ ...params, typeNode: type }),
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
          member.typeAnnotation === undefined
        ) {
          return [];
        }

        const keyAsString = (() => {
          switch (member.key.type) {
            case TSESTree.AST_NODE_TYPES.Identifier:
              return member.key.name;
            case TSESTree.AST_NODE_TYPES.Literal:
              return String(member.key.value);
            default:
              return undefined;
          }
        })();

        if (keyAsString === undefined) {
          return [];
        }

        const key = member.optional ? `${keyAsString}?` : keyAsString;

        const value = getResolvedTargetByTypeNode({
          ...params,
          typeNode: member.typeAnnotation.typeAnnotation,
        });

        return [[key, value]];
      }),
    };
  }

  if (
    params.typeNode.type === TSESTree.AST_NODE_TYPES.TSTypeReference &&
    params.typeNode.typeName.type === TSESTree.AST_NODE_TYPES.Identifier
  ) {
    if (params.reservedTypes.has(params.typeNode.typeName.name)) {
      return { kind: "type", value: params.typeNode.typeName.name };
    }

    if (params.typeNode.typeName.name === "Array") {
      const firstParam = params.typeNode.typeArguments?.params[0];

      if (firstParam !== undefined) {
        return {
          kind: "array",
          syntax: "type-reference",
          value: getResolvedTargetByTypeNode({ ...params, typeNode: firstParam }),
        };
      }
    }

    const type = params.checker.getTypeFromTypeNode(
      params.parser.esTreeNodeToTSNodeMap.get(params.typeNode),
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
          }),
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
}): ExpectedResolvedTarget {
  const { type, checker, parser, typeNode, reservedTypes } = params;

  const typeAsString = checker.typeToString(type);

  if (reservedTypes.has(typeAsString)) {
    return { kind: "type", value: checker.typeToString(type) };
  }

  if (reservedTypes.has(`${typeAsString}[]`)) {
    const arrayType = typeAsString.replace("[]", "");
    return { kind: "array", value: { kind: "type", value: arrayType } };
  }

  switch (typeAsString) {
    case "string":
      return { kind: "type", value: "string" };
    case "number":
      return { kind: "type", value: "number" };
    case "boolean":
      return { kind: "type", value: "boolean" };
    case "false":
      return { kind: "type", value: "false" };
    case "true":
      return { kind: "type", value: "true" };
    case "null":
      return { kind: "type", value: "null" };
    case "undefined":
      return { kind: "type", value: "undefined" };
    case "any":
      return { kind: "type", value: "any" };
  }

  switch (type.flags) {
    case ts.TypeFlags.String:
      return { kind: "type", value: "string" };
    case ts.TypeFlags.Number:
      return { kind: "type", value: "number" };
    case ts.TypeFlags.Boolean:
      return { kind: "type", value: "boolean" };
    case ts.TypeFlags.Null:
      return { kind: "type", value: "null" };
    case ts.TypeFlags.Undefined:
      return { kind: "type", value: "undefined" };
    case ts.TypeFlags.Any:
      return { kind: "type", value: "any" };
    default:
      break;
  }

  if (type.isLiteral()) {
    return { kind: "type", value: `'${type.value}'` };
  }

  if (type.isUnion()) {
    const types = type.types.map((type) =>
      getTypePropertiesFromTypeReference({ type, typeNode, parser, checker, reservedTypes }),
    );

    // Check for the specific case of [false, true, null]
    const isBooleanUnionWithNull =
      types.length === 3 &&
      types.some((t) => t.value === "false") &&
      types.some((t) => t.value === "true") &&
      types.some((t) => t.value === "null");

    if (isBooleanUnionWithNull) {
      return {
        kind: "union",
        value: [
          { kind: "type", value: "boolean" },
          { kind: "type", value: "null" },
        ],
      };
    }

    return {
      kind: "union",
      value: types,
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

  if (checker.isArrayType(type)) {
    const typeArguments = (type as ts.TypeReference).typeArguments;
    const firstArgument = typeArguments?.[0];

    if (firstArgument !== undefined) {
      const value = getTypePropertiesFromTypeReference({
        type: firstArgument,
        typeNode,
        parser,
        checker,
        reservedTypes,
      });

      return { kind: "array", value };
    }

    return { kind: "array", value: { kind: "type", value: "unknown" } };
  }

  if (type.symbol === undefined) {
    return { kind: "type", value: type.aliasSymbol?.escapedName.toString() ?? "unknown" };
  }

  if (type.symbol.valueDeclaration !== undefined) {
    const declaration = type.symbol.valueDeclaration;
    const sourceFile = declaration.getSourceFile();
    const filePath = sourceFile.fileName;

    if (!filePath.includes("node_modules")) {
      const entries = type.getProperties().map((property): [string, ExpectedResolvedTarget] => {
        const key = property.escapedName.toString();

        const propType = checker.getTypeOfSymbolAtLocation(
          property,
          parser.esTreeNodeToTSNodeMap.get(typeNode),
        );

        return [
          key,
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

    return { kind: "type", value: type.symbol.name };
  }

  if (type.flags === ts.TypeFlags.Object) {
    const entries = type.getProperties().map((property): [string, ExpectedResolvedTarget] => {
      const key = property.escapedName.toString();

      const propType = checker.getTypeOfSymbolAtLocation(
        property,
        parser.esTreeNodeToTSNodeMap.get(typeNode),
      );

      return [
        key,
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
