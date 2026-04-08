import type { TSESTree } from "@typescript-eslint/utils";
import { definePlugin } from "@ts-safeql/plugin-utils";

export default definePlugin({
  name: "sourcemap-test",
  package: "./src/rules/ts-fixture/sourcemap-plugin.ts",
  setup() {
    return {
      onTarget({ node }) {
        return node.tag.type === "Identifier" && node.tag.name === "sql"
          ? { skipTypeAnnotations: true }
          : undefined;
      },
      onExpression({ node }) {
        if (isCall(node, "ident")) {
          const argument = node.arguments[0];
          if (argument?.type === "Literal" && typeof argument.value === "string") {
            return `"${argument.value.replaceAll('"', '""')}"`;
          }
        }

        if (isCall(node, "jsonb")) {
          return "$N::jsonb";
        }

        if (isCall(node, "unnest2")) {
          return "unnest($N::int4[], $N::text[])";
        }

        return undefined;
      },
    };
  },
});

function isCall(
  node: TSESTree.Expression,
  name: string,
): node is TSESTree.CallExpression & { callee: TSESTree.Identifier } {
  return (
    node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === name
  );
}
