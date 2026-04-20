import { defineBuildConfig } from "unbuild";

export default defineBuildConfig([
  {
    entries: ["index"],
    declaration: true,
    sourcemap: true,
    rollup: {
      emitCJS: true,
      inlineDependencies: true,
    },
    externals: ["libpg-query"],
  },
]);
