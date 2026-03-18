import { defineBuildConfig } from "unbuild";

export default defineBuildConfig([
  {
    entries: ["src/index"],
    declaration: true,
    sourcemap: true,
    rollup: {
      emitCJS: true,
    },
  },
]);
