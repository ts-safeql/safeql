// @ts-check

import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import safeql from "@ts-safeql/eslint-plugin/config";

export default defineConfig({
  files: ["src/**/*.ts", "_fake_src/**/*.ts"],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      projectService: true,
    },
  },
  extends: [safeql.configs.useConfigFile],
});
