import { defineConfig } from "tsup";

export default defineConfig({
  outDir: "lib",
  entry: {
    index: "src/index.ts",
    "check-sql.worker": "src/rules/check-sql.worker.ts",
  },
  legacyOutput: true,
  external: ["eslint", "typescript", "./check-sql.worker"],
  clean: true,
  bundle: true,
});
