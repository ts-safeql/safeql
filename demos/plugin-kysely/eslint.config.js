// @ts-check

import safeql from "@ts-safeql/eslint-plugin/config";
import kysely from "@ts-safeql/plugin-kysely";
import tseslint from "typescript-eslint";

export default tseslint.config({
  files: ["src/**/*.ts"],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      projectService: true,
    },
  },
  extends: [
    safeql.configs.connections({
      // The Kysely plugin runs the TypeScript migrations in `migrations/`
      // against a shadow database, then validates queries against it.
      migrationsDir: "migrations",
      // `builder: true` also lints the raw `sql` fragments embedded inside
      // fluent builder chains (`.select(sql`...`.as())`, `.where(sql`...`)`).
      plugins: [kysely({ builder: true })],
      // CamelCasePlugin users: uncomment to map snake_case columns to camelCase.
      // targets: [{ tag: "sql", fieldTransform: "camel" }],
    }),
  ],
});
