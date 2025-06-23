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
    safeql.configs.connections([
      {
        migrationsDir: "migrations_client1",
        targets: [{ wrapper: "client1.+(query|queryOne|queryOneOrNone)" }],
      },
      {
        migrationsDir: "migrations_client2",
        targets: [{ wrapper: "client2.+(query|queryOne|queryOneOrNone)" }],
      },
    ]),
  ],
});
