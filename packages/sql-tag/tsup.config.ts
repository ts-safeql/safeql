import { defineConfig } from "tsup";

export default defineConfig({
  outDir: "lib",
  entry: ["src/index.ts"],
  legacyOutput: true,
  sourcemap: true,
  clean: true,
  bundle: true,
});
