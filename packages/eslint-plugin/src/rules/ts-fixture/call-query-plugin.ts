import { definePlugin } from "@ts-safeql/plugin-utils";

export default definePlugin({
  name: "call-query-dry-plugin",
  package: "./src/rules/ts-fixture/call-query-plugin.ts",
  setup() {
    return {
      queryNodeKinds: ["CallExpression"],
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
