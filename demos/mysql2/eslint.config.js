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
      driver: "mysql",
      databaseUrl: "mysql://root:rootpass@localhost:3307/safeql_mysql2_demo",
      targets: [{ tag: "sql", transform: "{type}[]" }],
    }),
  ],
});
