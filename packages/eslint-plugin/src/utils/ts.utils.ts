import { ParserServices, TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";

export function tsTypeToText(params: {
  checker: ts.TypeChecker;
  parser: ParserServices;
  typeNode: TSESTree.TypeNode;
}): null | string {
  const { checker, parser, typeNode } = params;

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSTypeLiteral) {
    return typeElementsToString({
      checker: checker,
      parser: parser,
      elements: typeNode.members,
    });
  }

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSTypeReference) {
    const type = checker.getTypeFromTypeNode(parser.esTreeNodeToTSNodeMap.get(typeNode));
    return typeMembersToString({
      checker: checker,
      members: type.symbol.members,
    });
  }

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSArrayType) {
    return tsTypeToText({ checker, parser, typeNode: typeNode.elementType }) + "[]";
  }

  return "UNKNOWN" as const;
}

export function typeElementsToString(params: {
  checker: ts.TypeChecker;
  parser: ParserServices;
  elements: TSESTree.TypeElement[];
}) {
  const { elements, parser, checker } = params;

  const entries: { key: string; type: string }[] = [];

  for (const element of elements) {
    if (
      element.type === TSESTree.AST_NODE_TYPES.TSPropertySignature &&
      element.key.type === TSESTree.AST_NODE_TYPES.Identifier
    ) {
      const key = element.key.name;
      const tsNode = parser.esTreeNodeToTSNodeMap.get(element);
      const type = checker.getTypeAtLocation(tsNode);
      const typeString = checker.typeToString(type);
      entries.push({ key, type: typeString });
    }
  }

  return mapEntriesToInlineLiteralTypeString(entries);
}

export function typeMembersToString(params: { checker: ts.TypeChecker; members?: ts.SymbolTable }) {
  const { checker, members } = params;
  const entries: { key: string; type: string }[] = [];

  members?.forEach((value, key) => {
    const type = checker.getTypeOfSymbolAtLocation(value, value.valueDeclaration!);
    const typeString = checker.typeToString(type);

    entries.push({ key: key.toString(), type: typeString });
  });

  if (entries.length === 0) {
    return null;
  }

  return mapEntriesToInlineLiteralTypeString(entries);
}

function mapEntriesToInlineLiteralTypeString(entries: { key: string; type: string }[]) {
  return `{ ${entries.map(({ key, type }) => `${key}: ${type};`).join(" ")} }`;
}
