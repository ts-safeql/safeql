// @ts-check

import { defineConfig } from "eslint/config";
import safeql from "@ts-safeql/eslint-plugin/config";
import slonik from "@ts-safeql/plugin-slonik";
import tseslint from "typescript-eslint";

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
      databaseUrl: "postgres://postgres:postgres@localhost:5432/postgres",
      plugins: [slonik()],
    }),
  ],
});
