// @ts-check

import tseslint from "typescript-eslint";
import safeql from "@ts-safeql/eslint-plugin/config";

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
      migrationsDir: "migrations",
      targets: [{ tag: "sql", transform: "{type}[]" }],
      overrides: {
        types: {
          timestamptz: {
            parameter: "+(Parameter<LocalDate>|LocalDate)",
            return: "LocalDate",
          },
        },
      },
      nullAsUndefined: true,
      nullAsOptional: true,
    }),
  ],
});
