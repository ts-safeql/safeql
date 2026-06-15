import { defineConfig, mergeConfig } from "vitest/config";
import shared from "../../../vitest.shared";

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      pool: "forks",
    },
  }),
);
