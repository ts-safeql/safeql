import { definePlugin } from "@ts-safeql/plugin-utils";

export default definePlugin({
  name: "call-query-dry-plugin",
  package: "./src/rules/ts-fixture/call-query-plugin.ts",
  setup() {
    return {
      queryNodeKinds: [
        {
          kind: "CallExpression",
          callee: {
            property: {
              nameIn: ["run", "get", "getOrThrow", "prepare", "iterate"],
            },
          },
        },
      ],
      resolveQuery() {
        return {
          kind: "sql",
          text: "SELECT 1 AS one",
          sourcemaps: [],
        };
      },
    };
  },
});
