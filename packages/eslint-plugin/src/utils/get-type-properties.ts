import { ParserServices, TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import { TSUtils } from "./ts.utils";

export function getTypeProperties(params: {
  typeNode: TSESTree.TypeNode;
  parser: ParserServices;
  checker: ts.TypeChecker;
  reservedTypes: Set<string>;
}): { properties: [string, string][]; isArray: boolean } {
  const { typeNode, checker, parser, reservedTypes } = params;

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSArrayType) {
    const { properties } = getTypeProperties({
      typeNode: typeNode.elementType,
      parser,
      checker,
      reservedTypes,
    });

    return { properties, isArray: true };
  }

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSIntersectionType) {
    const properties = typeNode.types.flatMap(
      (type) => getTypeProperties({ typeNode: type, parser, checker, reservedTypes }).properties
    );

    return { properties, isArray: false };
  }

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSTypeLiteral) {
    const properties = getTypePropertiesFromTypeLiteral({
      typeNode,
      parser,
      checker,
      reservedTypes,
    });

    return { properties, isArray: false };
  }

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSTypeReference) {
    const type = checker.getTypeFromTypeNode(parser.esTreeNodeToTSNodeMap.get(typeNode));
    const properties = getTypePropertiesFromTypeReference({ type, typeNode, parser, checker });

    return { properties, isArray: false };
  }

  return { properties: [], isArray: false };
}

function getTypePropertiesFromTypeLiteral(params: {
  typeNode: TSESTree.TSTypeLiteral;
  parser: ParserServices;
  checker: ts.TypeChecker;
  reservedTypes: Set<string>;
}) {
  const { typeNode, checker, parser, reservedTypes } = params;
  const properties: [string, string][] = [];

  for (const member of typeNode.members) {
    if (
      member.type !== TSESTree.AST_NODE_TYPES.TSPropertySignature ||
      member.key.type !== TSESTree.AST_NODE_TYPES.Identifier
    ) {
      continue;
    }

    const tsNode = parser.esTreeNodeToTSNodeMap.get(member);

    const tsNodeTypes = TSUtils.isTypeUnion(tsNode.type)
      ? tsNode.type.types
      : tsNode.type === undefined
      ? []
      : [tsNode.type];

    const actualType = tsNodeTypes
      .map((type) => {
        const originalTypeString = type.getText();

        return reservedTypes.has(originalTypeString)
          ? originalTypeString
          : checker.typeToString(checker.getTypeAtLocation(type));
      })
      .join(" | ");

    properties.push([member.key.name, actualType]);
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
