// @ts-check

import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import safeql from "@ts-safeql/eslint-plugin/config";

export default defineConfig({
  files: ["src/**/*.ts"],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      projectService: true,
    },
  },
  extends: [
    safeql.configs.connections({
      databaseUrl: "postgres://postgres:postgres@localhost:5432/safeql_typeorm",
      targets: [{ tag: "sql", transform: "{type}[]" }],
    }),
  ],
});
