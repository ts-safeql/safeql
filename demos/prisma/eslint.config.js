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
      migrationsDir: "./prisma/migrations",
      targets: [{ tag: "prisma.+($queryRaw|$executeRaw)", transform: "{type}[]" }],
    }),
  ],
});
