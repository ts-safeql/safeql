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

const PRIMITIVES = {
  string: "string",
  number: "number",
  boolean: "boolean",
  false: "false",
  true: "true",
  null: "null",
  undefined: "undefined",
  any: "any",
} as const;

export function getResolvedTargetByTypeNode(
  params: GetResolvedTargetByTypeNodeParams,
): ExpectedResolvedTarget {
  const typeText = params.parser.esTreeNodeToTSNodeMap.get(params.typeNode).getText();

  if (isReservedType(typeText, params.reservedTypes)) {
    return { kind: "type", value: typeText };
  }

  switch (params.typeNode.type) {
    case TSESTree.AST_NODE_TYPES.TSLiteralType:
      return handleLiteralType(params.typeNode);

    case TSESTree.AST_NODE_TYPES.TSUnionType:
      return {
        kind: "union",
        value: params.typeNode.types.map((type) =>
          getResolvedTargetByTypeNode({ ...params, typeNode: type }),
        ),
      };

    case TSESTree.AST_NODE_TYPES.TSNullKeyword:
      return { kind: "type", value: "null" };

    case TSESTree.AST_NODE_TYPES.TSUndefinedKeyword:
      return { kind: "type", value: "undefined" };

    case TSESTree.AST_NODE_TYPES.TSTypeLiteral:
      return handleTypeLiteral(params.typeNode, params);

    case TSESTree.AST_NODE_TYPES.TSTypeReference:
      return handleTypeReference(params.typeNode, params);

    case TSESTree.AST_NODE_TYPES.TSIntersectionType:
      return handleIntersectionType(params.typeNode, params);

    case TSESTree.AST_NODE_TYPES.TSArrayType:
      return {
        kind: "array",
        value: getResolvedTargetByTypeNode({
          ...params,
          typeNode: params.typeNode.elementType,
        }),
      };

    default:
      return { kind: "type", value: typeText };
  }
}

function isReservedType(typeText: string, reservedTypes: Set<string>): boolean {
  return reservedTypes.has(typeText) || reservedTypes.has(`${typeText}[]`);
}

function handleLiteralType(typeNode: TSESTree.TSLiteralType): ExpectedResolvedTarget {
  return typeNode.literal.type === TSESTree.AST_NODE_TYPES.Literal
    ? { kind: "type", value: `'${typeNode.literal.value}'` }
    : { kind: "type", value: "unknown" };
}

function handleTypeLiteral(
  typeNode: TSESTree.TSTypeLiteral,
  params: GetResolvedTargetByTypeNodeParams,
): ExpectedResolvedTarget {
  const properties = typeNode.members.flatMap((member) => {
    if (member.type !== TSESTree.AST_NODE_TYPES.TSPropertySignature || !member.typeAnnotation) {
      return [];
    }

    const key = extractPropertyKey(member.key);
    if (!key) return [];

    const propertyName = member.optional ? `${key}?` : key;
    const propertyType = getResolvedTargetByTypeNode({
      ...params,
      typeNode: member.typeAnnotation.typeAnnotation,
    });

    return [[propertyName, propertyType] as ExpectedResolvedTargetEntry];
  });

  return { kind: "object", value: properties };
}

function extractPropertyKey(key: TSESTree.PropertyName): string | undefined {
  switch (key.type) {
    case TSESTree.AST_NODE_TYPES.Identifier:
      return key.name;
    case TSESTree.AST_NODE_TYPES.Literal:
      return String(key.value);
    default:
      return undefined;
  }
}

function handleTypeReference(
  typeNode: TSESTree.TSTypeReference,
  params: GetResolvedTargetByTypeNodeParams,
): ExpectedResolvedTarget {
  if (
    typeNode.typeName.type !== TSESTree.AST_NODE_TYPES.Identifier &&
    typeNode.typeName.type !== TSESTree.AST_NODE_TYPES.TSQualifiedName
  ) {
    return { kind: "type", value: "unknown" };
  }

  const typeNameText = params.parser.esTreeNodeToTSNodeMap.get(typeNode.typeName).getText();

  if (params.reservedTypes.has(typeNameText)) {
    return { kind: "type", value: typeNameText };
  }

  if (typeNameText === "Array" && typeNode.typeArguments?.params[0]) {
    return {
      kind: "array",
      syntax: "type-reference",
      value: getResolvedTargetByTypeNode({
        ...params,
        typeNode: typeNode.typeArguments.params[0],
      }),
    };
  }

  const type = params.checker.getTypeFromTypeNode(
    params.parser.esTreeNodeToTSNodeMap.get(typeNode),
  );
  return resolveType(type, { ...params, typeNode });
}

function handleIntersectionType(
  typeNode: TSESTree.TSIntersectionType,
  params: GetResolvedTargetByTypeNodeParams,
): ExpectedResolvedTarget {
  const allProperties = typeNode.types.flatMap((type) => {
    const resolved = getResolvedTargetByTypeNode({ ...params, typeNode: type });
    return resolved.kind === "object" ? resolved.value : [];
  });

  return { kind: "object", value: Array.from(new Map(allProperties).entries()) };
}

function resolveType(
  type: ts.Type,
  params: GetResolvedTargetByTypeNodeParams,
): ExpectedResolvedTarget {
  const typeAsString = params.checker.typeToString(type);

  if (params.reservedTypes.has(typeAsString)) {
    return { kind: "type", value: typeAsString };
  }

  if (params.reservedTypes.has(`${typeAsString}[]`)) {
    return { kind: "array", value: { kind: "type", value: typeAsString.replace("[]", "") } };
  }

  const primitive = getPrimitiveType(type, typeAsString);
  if (primitive) return primitive;

  if (type.isLiteral()) {
    return { kind: "type", value: `'${type.value}'` };
  }

  if (type.isUnion()) {
    return handleUnionTypeReference(type, params);
  }

  if (type.isIntersection()) {
    return handleIntersectionTypeReference(type, params);
  }

  if (params.checker.isArrayType(type)) {
    return handleArrayTypeReferenceFromType(type, params);
  }

  return handleObjectType(type, params);
}

function getPrimitiveType(type: ts.Type, typeAsString: string): ExpectedResolvedTarget | null {
  if (PRIMITIVES[typeAsString as keyof typeof PRIMITIVES]) {
    return { kind: "type", value: PRIMITIVES[typeAsString as keyof typeof PRIMITIVES] };
  }

  const flagMap = {
    [ts.TypeFlags.String]: "string",
    [ts.TypeFlags.Number]: "number",
    [ts.TypeFlags.Boolean]: "boolean",
    [ts.TypeFlags.Null]: "null",
    [ts.TypeFlags.Undefined]: "undefined",
    [ts.TypeFlags.Any]: "any",
  } as const;

  return flagMap[type.flags as keyof typeof flagMap]
    ? { kind: "type", value: flagMap[type.flags as keyof typeof flagMap] }
    : null;
}

function handleUnionTypeReference(
  type: ts.UnionType,
  params: GetResolvedTargetByTypeNodeParams,
): ExpectedResolvedTarget {
  const types = type.types.map((t) => resolveType(t, params));

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

  return { kind: "union", value: types };
}

function handleIntersectionTypeReference(
  type: ts.IntersectionType,
  params: GetResolvedTargetByTypeNodeParams,
): ExpectedResolvedTarget {
  const properties = type.types.flatMap((t) => {
    const resolved = resolveType(t, params);
    return resolved.kind === "object" ? resolved.value : [];
  });

  return { kind: "object", value: properties };
}

function handleArrayTypeReferenceFromType(
  type: ts.Type,
  params: GetResolvedTargetByTypeNodeParams,
): ExpectedResolvedTarget {
  const typeArguments = (type as ts.TypeReference).typeArguments;
  const firstArgument = typeArguments?.[0];

  if (firstArgument) {
    const elementType = resolveType(firstArgument, params);
    return { kind: "array", value: elementType };
  }

  return { kind: "array", value: { kind: "type", value: "unknown" } };
}

function handleObjectType(
  type: ts.Type,
  params: GetResolvedTargetByTypeNodeParams,
): ExpectedResolvedTarget {
  if (!type.symbol) {
    return { kind: "type", value: type.aliasSymbol?.escapedName.toString() ?? "unknown" };
  }

  if (type.symbol.valueDeclaration) {
    const declaration = type.symbol.valueDeclaration;
    const sourceFile = declaration.getSourceFile();
    const filePath = sourceFile.fileName;

    if (!filePath.includes("node_modules")) {
      return extractObjectProperties(type, params);
    }

    return { kind: "type", value: type.symbol.name };
  }

  if (type.flags === ts.TypeFlags.Object) {
    return extractObjectProperties(type, params);
  }

  return { kind: "object", value: [] };
}

function extractObjectProperties(
  type: ts.Type,
  params: GetResolvedTargetByTypeNodeParams,
): ExpectedResolvedTarget {
  const properties = type.getProperties().map((property): ExpectedResolvedTargetEntry => {
    const key = property.escapedName.toString();
    const propType = params.checker.getTypeOfSymbolAtLocation(
      property,
      params.parser.esTreeNodeToTSNodeMap.get(params.typeNode),
    );

    const resolvedType = resolveType(propType, params);
    return [key, resolvedType];
  });

  return { kind: "object", value: properties };
}
