import { TSESTree } from "@typescript-eslint/utils";

export function isIdentifier(node?: TSESTree.Node): node is TSESTree.Identifier {
  return node?.type === TSESTree.AST_NODE_TYPES.Identifier;
}

export function isCallExpression(node?: TSESTree.Node): node is TSESTree.CallExpression {
  return node?.type === TSESTree.AST_NODE_TYPES.CallExpression;
}

export function isTaggedTemplateExpression(
  node?: TSESTree.Node,
): node is TSESTree.TaggedTemplateExpression {
  return node?.type === TSESTree.AST_NODE_TYPES.TaggedTemplateExpression;
}

export function isMemberExpression(node?: TSESTree.Node): node is TSESTree.MemberExpression {
  return node?.type === TSESTree.AST_NODE_TYPES.MemberExpression;
}

export function isOneOf<T extends PropertyKey>(value: unknown, options: T[]): value is T {
  return options.includes(value as T);
}

export function isEqual<T extends PropertyKey>(value: unknown, expected: T): value is T {
  return value === expected;
}
