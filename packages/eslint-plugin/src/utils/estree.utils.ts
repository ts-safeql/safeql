import { TSESTree } from "@typescript-eslint/utils";
import { either } from "fp-ts";
import * as recast from "recast";


/**
 * Based on a given source location, a string and a position in the string,
 * return a new source location that is the position in the string at the
 * given source.
 */
export function getSourceLocationFromStringPosition(params: {
  loc: TSESTree.SourceLocation;
  position: number;
  value: string;
}) {
  const textFromPosition = params.value.substring(params.position - 1, params.value.length);
  const wordInPosition = textFromPosition
    .substring(0, textFromPosition.slice(0).search(/\s/))
    .trim();

  for (const [lineIdx, line] of params.value.split("\n").entries()) {
    if (line.includes(wordInPosition)) {
      const startLine = params.loc.start.line + lineIdx;
      const endLine = params.loc.start.line + lineIdx;
      const startColumn = line.search(wordInPosition);
      const endColumn = startColumn + wordInPosition.length + 1;

      return {
        start: {
          line: startLine,
          column: startColumn,
        },
        end: {
          line: endLine,
          column: endColumn,
        },
      };
    }
  }

  return params.loc;
}

// export function mapTypeParameterInstantiationToText(params: TSESTree.TSTypeParameterInstantiation) {
//     const x = recast.print(params).code;
//     return either.right(x);

//   const param = params.params[0];

//   if (param.type !== TSESTree.AST_NODE_TYPES.TSTypeLiteral) {
//     return either.left("type is not a TSTypeLiteral");
//   }

//   const mappedMembers: string[] = [];

//   for (const member of param.members) {
//     const mapped = mapTypeElementToText(member);

//     if (either.isLeft(mapped)) {
//       return either.left(mapped.left);
//     }

//     mappedMembers.push(mapped.right);
//   }

//   return either.right(`{${mappedMembers.join("; ")}}`);
// }

// function typeNodeToText(typeNode: TSESTree.TypeNode): string {
//   switch (typeNode.type) {
//     case TSESTree.AST_NODE_TYPES.TSUnionType:
//       return typeNode.types.map(typeNodeToText).join(" | ");
//     case TSESTree.AST_NODE_TYPES.TSIntersectionType:
//       return typeNode.types.map(typeNodeToText).join(" | ");
//     case TSESTree.AST_NODE_TYPES.TSArrayType:
//       return `${typeNodeToText(typeNode.elementType)}[]`;
//     case TSESTree.AST_NODE_TYPES.TSTypeReference:
//       return typeNode.typeName.type === TSESTree.AST_NODE_TYPES.Identifier
//         ? typeNode.typeName.name
//         : "unsupported";
//     case TSESTree.AST_NODE_TYPES.TSNumberKeyword:
//       return "number";
//     case TSESTree.AST_NODE_TYPES.TSStringKeyword:
//       return "string";
//     case TSESTree.AST_NODE_TYPES.TSBooleanKeyword:
//       return "boolean";
//     case TSESTree.AST_NODE_TYPES.TSNullKeyword:
//       return "null";
//     case TSESTree.AST_NODE_TYPES.TSUndefinedKeyword:
//       return "undefined";
//     case TSESTree.AST_NODE_TYPES.TSAnyKeyword:
//       return "any";
//     case TSESTree.AST_NODE_TYPES.TSUnknownKeyword:
//       return "unknown";
//     case TSESTree.AST_NODE_TYPES.TSObjectKeyword:
//       return "object";
//     default:
//       return "unsupported";
//   }
// }

// function mapTypeElementToText(member: TSESTree.TypeElement) {
//   if (member.type !== TSESTree.AST_NODE_TYPES.TSPropertySignature) {
//     return either.left("member is not a TSPropertySignature");
//   }

//   if (member.key.type !== TSESTree.AST_NODE_TYPES.Identifier) {
//     return either.left("member key is not an Identifier");
//   }

//   if (member.typeAnnotation === undefined) {
//     return either.left(`member ${member.key.name} typeAnnotation is undefined`);
//   }

//   const withOptional = (val: string) => (member.optional ? `${val}?` : val);

//   const property = member.optional ? `${member.key.name}?` : member.key.name;
//   const value = member.typeAnnotation !== undefined ? typeNodeToText(member.typeAnnotation.typeAnnotation) : "unknown";

//   return either.right(
//     `${withOptional(member.key.name)}: ${typeNodeToText(member.typeAnnotation.typeAnnotation)}`
//   );
// }
