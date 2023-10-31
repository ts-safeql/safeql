import { defineConfig } from "tsup";

export default defineConfig({
  outDir: "lib",
  entry: ["index.ts"],
  legacyOutput: true,
  sourcemap: true,
  clean: true,
  bundle: true,
});
