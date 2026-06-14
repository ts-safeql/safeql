import type { TSESTree } from "@typescript-eslint/utils";

/** The leftmost identifier of a member/call chain (`a.b().c` → `a`). */
export function getRootIdentifier(params: {
  node: TSESTree.Expression;
}): TSESTree.Identifier | undefined {
  const node = unwrap(params.node);
  if (node.type === "Identifier") return node;
  if (node.type === "MemberExpression") return getRootIdentifier({ node: node.object });
  if (node.type === "CallExpression") return getRootIdentifier({ node: node.callee });
  return undefined;
}

/** The method name of a member access or method call (`a.b` / `a.b()` → `"b"`). */
export function getMethodName(params: { node: TSESTree.Expression }): string | undefined {
  const node = unwrap(params.node);
  if (node.type === "MemberExpression") return identifierName(node.property);
  if (node.type === "CallExpression" && node.callee.type === "MemberExpression") {
    return identifierName(node.callee.property);
  }
  return undefined;
}

/** Strip wrappers that don't change the referenced value (`a?.b`, `a as T`, `a satisfies T`, `a!`, `<T>a`, `a<T>`, `await a`). */
function unwrap(node: TSESTree.Expression): TSESTree.Expression {
  switch (node.type) {
    case "ChainExpression":
    case "TSNonNullExpression":
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSTypeAssertion":
    case "TSInstantiationExpression":
      return unwrap(node.expression);
    case "AwaitExpression":
      return unwrap(node.argument);
    default:
      return node;
  }
}

/** Each element's value if every element is a string literal, else `undefined`. */
export function getStringLiterals(params: {
  nodes: readonly (TSESTree.Expression | TSESTree.SpreadElement | null)[];
}): string[] | undefined {
  const parts: string[] = [];

  for (const node of params.nodes) {
    if (node?.type !== "Literal" || typeof node.value !== "string") return undefined;
    parts.push(node.value);
  }

  return parts;
}

function identifierName(
  node: TSESTree.Expression | TSESTree.PrivateIdentifier,
): string | undefined {
  return node.type === "Identifier" ? node.name : undefined;
}
