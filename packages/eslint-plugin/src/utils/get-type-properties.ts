import { ResolvedTarget } from "@ts-safeql/generate";
import { ParserServices, TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";

type GetTypePropertiesParams = {
  typeNode: TSESTree.TypeNode;
  parser: ParserServices;
  checker: ts.TypeChecker;
  reservedTypes: Set<string>;
};

export function getTypeProperties(params: GetTypePropertiesParams): ResolvedTarget {
  const { typeNode, checker, parser, reservedTypes } = params;

  if (
    typeNode.type === TSESTree.AST_NODE_TYPES.TSLiteralType &&
    typeNode.literal.type === TSESTree.AST_NODE_TYPES.Literal
  ) {
    return { kind: "type", value: `'${typeNode.literal.value}'` };
  }

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSUnionType) {
    return {
      kind: "union",
      value: typeNode.types.map((type) => getTypeProperties({ ...params, typeNode: type })),
    };
  }

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSNullKeyword) {
    return { kind: "type", value: "null" };
  }

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSUndefinedKeyword) {
    return { kind: "type", value: "undefined" };
  }

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSTypeLiteral) {
    return {
      kind: "object",
      value: typeNode.members.flatMap((member) => {
        if (
          member.type !== TSESTree.AST_NODE_TYPES.TSPropertySignature ||
          member.key.type !== TSESTree.AST_NODE_TYPES.Identifier ||
          member.typeAnnotation === undefined
        ) {
          return [];
        }

        const value = getTypeProperties({
          ...params,
          typeNode: member.typeAnnotation.typeAnnotation,
        });

        const key = member.optional ? `${member.key.name}?` : member.key.name;

        return [[key, value]];
      }),
    };
  }

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSTypeReference) {
    if (
      typeNode.typeName.type === TSESTree.AST_NODE_TYPES.Identifier &&
      reservedTypes.has(typeNode.typeName.name)
    ) {
      return { kind: "type", value: typeNode.typeName.name };
    }

    const type = checker.getTypeFromTypeNode(parser.esTreeNodeToTSNodeMap.get(typeNode));
    return getTypePropertiesFromTypeReference({ type, typeNode, parser, checker, reservedTypes });
  }

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSIntersectionType) {
    return {
      kind: "object",
      value: [
        ...new Map(
          typeNode.types.flatMap((type) => {
            const targetEntry = getTypeProperties({ ...params, typeNode: type });
            return targetEntry.kind === "object" ? targetEntry.value : [];
          })
        ).entries(),
      ],
    };
  }

  if (typeNode.type === TSESTree.AST_NODE_TYPES.TSArrayType) {
    return {
      kind: "array",
      value: getTypeProperties({ ...params, typeNode: typeNode.elementType }),
    };
  }

  return { kind: "type", value: params.parser.esTreeNodeToTSNodeMap.get(typeNode).getText() };
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

// export function getTypePropertiesOld(params: {
//   typeNode: TSESTree.TypeNode;
//   parser: ParserServices;
//   checker: ts.TypeChecker;
//   reservedTypes: Set<string>;
// }): { properties: [string, string][]; isArray: boolean } {
//   const { typeNode, checker, parser, reservedTypes } = params;

//   if (typeNode.type === TSESTree.AST_NODE_TYPES.TSArrayType) {
//     const { properties } = getTypeProperties({
//       typeNode: typeNode.elementType,
//       parser,
//       checker,
//       reservedTypes,
//     });

//     return { properties, isArray: true };
//   }

//   if (typeNode.type === TSESTree.AST_NODE_TYPES.TSIntersectionType) {
//     const properties = typeNode.types.flatMap(
//       (type) => getTypeProperties({ typeNode: type, parser, checker, reservedTypes }).properties
//     );

//     return { properties, isArray: false };
//   }

//   if (typeNode.type === TSESTree.AST_NODE_TYPES.TSTypeLiteral) {
//     const properties = getTypePropertiesFromTypeLiteral({
//       typeNode,
//       parser,
//       checker,
//       reservedTypes,
//     });

//     return { properties, isArray: false };
//   }

//   if (typeNode.type === TSESTree.AST_NODE_TYPES.TSTypeReference) {
//     const type = checker.getTypeFromTypeNode(parser.esTreeNodeToTSNodeMap.get(typeNode));
//     const properties = getTypePropertiesFromTypeReference({ type, typeNode, parser, checker });

//     return { properties, isArray: false };
//   }

//   return { properties: [], isArray: false };
// }

// function getTypePropertiesFromTypeLiteral(params: {
//   typeNode: TSESTree.TSTypeLiteral;
//   parser: ParserServices;
//   checker: ts.TypeChecker;
//   reservedTypes: Set<string>;
// }) {
//   const { typeNode, checker, parser, reservedTypes } = params;
//   const properties: [string, string][] = [];

//   for (const member of typeNode.members) {
//     if (
//       member.type !== TSESTree.AST_NODE_TYPES.TSPropertySignature ||
//       member.key.type !== TSESTree.AST_NODE_TYPES.Identifier
//     ) {
//       continue;
//     }

//     const tsNode = parser.esTreeNodeToTSNodeMap.get(member);

//     const tsNodeTypes = TSUtils.isTypeUnion(tsNode.type)
//       ? tsNode.type.types
//       : tsNode.type === undefined
//       ? []
//       : [tsNode.type];

//     const actualType = tsNodeTypes
//       .map((type) => {
//         const originalTypeString = type.getText();

//         return reservedTypes.has(originalTypeString)
//           ? originalTypeString
//           : checker.typeToString(checker.getTypeAtLocation(type));
//       })
//       .join(" | ");

//     const key = member.optional ? `${member.key.name}?` : member.key.name;

//     properties.push([key, actualType]);
//   }

//   return properties;
// }

// function getTypePropertiesFromTypeReference(params: {
//   typeNode: TSESTree.TSTypeReference;
//   type: ts.Type;
//   parser: ParserServices;
//   checker: ts.TypeChecker;
// }): [string, string][] {
//   const { typeNode, type, parser, checker } = params;

//   return type.getProperties().map((property) => {
//     const type = checker.getTypeOfSymbolAtLocation(
//       property,
//       parser.esTreeNodeToTSNodeMap.get(typeNode)
//     );

//     const typeName = checker.typeToString(type);

//     return [property.escapedName.toString(), typeName];
//   });
// }

// export function toInlineLiteralTypeString(params: {
//   properties: Map<string, string>;
//   isArray: boolean;
// }): string {
//   const { properties, isArray } = params;
//   const entries = [...properties.entries()].reduce((acc, [key, type]) => {
//     acc.push(`${key}: ${type}`);
//     return acc;
//   }, [] as string[]);

//   if (entries.length === 0) {
//     return isArray ? "{ }[]" : "{ }";
//   }

//   let typeString = `{ ${entries.join("; ")}; }`;

//   if (isArray) {
//     typeString = `${typeString}[]`;
//   }

//   return typeString;
// }
