import { defineBuildConfig } from "unbuild";

export default defineBuildConfig([
  {
    entries: ["src/index", "src/plugin-test-driver"],
    declaration: true,
    sourcemap: true,
    externals: ["@typescript-eslint/parser", "@typescript-eslint/utils", "typescript"],
    rollup: {
      emitCJS: true,
    },
  },
]);
