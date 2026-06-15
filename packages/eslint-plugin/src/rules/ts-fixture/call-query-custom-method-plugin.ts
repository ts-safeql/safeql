import { definePlugin } from "@ts-safeql/plugin-utils";

export default definePlugin({
  name: "call-query-custom-method-plugin",
  package: "./src/rules/ts-fixture/call-query-custom-method-plugin.ts",
  setup() {
    return {
      queryNodeKinds: [
        { kind: "CallExpression", callee: { property: { nameIn: ["runRawQuery"] } } },
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
