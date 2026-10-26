import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import shared from "../../vitest.shared";

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, "**/*.contract.test.ts"],
    },
  }),
);
