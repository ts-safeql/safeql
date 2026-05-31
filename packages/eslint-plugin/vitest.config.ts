import { defineConfig, mergeConfig } from "vitest/config";
import shared from "../../vitest.shared";

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      pool: "forks",
      hideSkippedTests: true,
      globalSetup: ["./src/rules/check-sql/check-sql.global-setup.ts"],
    },
  }),
);
