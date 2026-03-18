// @ts-check

import "dotenv/config";
import safeql from "@ts-safeql/eslint-plugin/config";
import awsIamAuth from "@ts-safeql/plugin-auth-aws";
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
      plugins: [
        awsIamAuth({
          databaseHost: process.env.SAFEQL_DATABASE_HOST ?? "",
          databasePort: Number(process.env.SAFEQL_DATABASE_PORT ?? 5432),
          databaseUser: process.env.SAFEQL_DATABASE_USER ?? "",
          databaseName: process.env.SAFEQL_DATABASE_NAME ?? "",
          awsRegion: process.env.SAFEQL_AWS_REGION ?? "",
          awsProfile: process.env.SAFEQL_AWS_PROFILE,
        }),
      ],
      targets: [{ tag: "sql", transform: "{type}[]" }],
    }),
  ],
});
