import { ParserServices, TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";

export function getTypeProperties(params: {
  typeNode: TSESTree.TypeNode;
  parser: ParserServices;
  checker: ts.TypeChecker;
}): [string, string][] {
  const { typeNode, checker, parser } = params;

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSArrayType) {
    return getTypeProperties({
      typeNode: typeNode.elementType,
      parser,
      checker,
    });
  }

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSIntersectionType) {
    return typeNode.types.flatMap((type) => getTypeProperties({ typeNode: type, parser, checker }));
  }

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSTypeLiteral) {
    return getTypePropertiesFromTypeLiteral({ typeNode, parser, checker });
  }

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSTypeReference) {
    const type = checker.getTypeFromTypeNode(parser.esTreeNodeToTSNodeMap.get(typeNode));

    return getTypePropertiesFromTypeReference({ type, typeNode, parser, checker });
  }

  return [];
}

function getTypePropertiesFromTypeLiteral(params: {
  typeNode: TSESTree.TSTypeLiteral;
  parser: ParserServices;
  checker: ts.TypeChecker;
}) {
  const { typeNode, checker, parser } = params;
  const properties: [string, string][] = [];

  for (const member of typeNode.members) {
    if (
      member.type !== TSESTree.AST_NODE_TYPES.TSPropertySignature ||
      member.key.type !== TSESTree.AST_NODE_TYPES.Identifier
    ) {
      continue;
    }

    const name = member.key.name;
    const tsNode = parser.esTreeNodeToTSNodeMap.get(member);
    const type = checker.getTypeAtLocation(tsNode);
    const typeString = checker.typeToString(type);
    properties.push([name, typeString]);
  }

  return properties;
}

function getTypePropertiesFromTypeReference(params: {
  typeNode: TSESTree.TSTypeReference;
  type: ts.Type;
  parser: ParserServices;
  checker: ts.TypeChecker;
}): [string, string][] {
  const { typeNode, type, parser, checker } = params;

  return type.getProperties().map((property) => {
    const type = checker.getTypeOfSymbolAtLocation(
      property,
      parser.esTreeNodeToTSNodeMap.get(typeNode)
    );

    const typeName = checker.typeToString(type);

    return [property.escapedName.toString(), typeName];
  });
}

export function toInlineLiteralTypeString(params: {
  properties: Map<string, string>;
  isArray: boolean;
}): string {
  const { properties, isArray } = params;
  const entries = [...properties.entries()].reduce((acc, [key, type]) => {
    acc.push(`${key}: ${type}`);
    return acc;
  }, [] as string[]);

  if (entries.length === 0) {
    return isArray ? "{ }[]" : "{ }";
  }

  let typeString = `{ ${entries.join("; ")}; }`;

  if (isArray) {
    typeString = `${typeString}[]`;
  }

  return typeString;
}
