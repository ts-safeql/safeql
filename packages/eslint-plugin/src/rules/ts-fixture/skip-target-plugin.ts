import { definePlugin } from "@ts-safeql/plugin-utils";

export default definePlugin({
  name: "skip-target-test",
  package: "./src/rules/ts-fixture/skip-target-plugin.ts",
  setup() {
    return {
      onTarget({ node }) {
        return node.tag.type === "Identifier" && node.tag.name === "sql" ? false : undefined;
      },
    };
  },
});
