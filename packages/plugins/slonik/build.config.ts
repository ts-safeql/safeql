import { defineBuildConfig } from "unbuild";

export default defineBuildConfig([
  {
    entries: ["src/index"],
    declaration: true,
    sourcemap: true,
    rollup: {
      emitCJS: true,
    },
    externals: [
      "@ts-safeql/plugin-utils",
      "@ts-safeql/zod-annotator",
      "@typescript-eslint/utils",
      "typescript",
    ],
  },
]);
