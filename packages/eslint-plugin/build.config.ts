import { defineBuildConfig } from "unbuild";

export default defineBuildConfig([
  {
    entries: ["src/index", "src/config", "src/workers/check-sql.worker.ts"],
    declaration: true,
    sourcemap: true,
    rollup: {
      emitCJS: true,
      inlineDependencies: true,
    },
    externals: ["typescript", "libpg-query"],
  },
]);
