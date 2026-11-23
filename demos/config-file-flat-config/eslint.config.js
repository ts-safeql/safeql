// @ts-check

import { defineConfig } from "eslint/config";
import safeql from "@ts-safeql/eslint-plugin/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  ...tseslint.configs.recommendedTypeCheckedOnly,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
  safeql.configs.useConfigFile,
);
