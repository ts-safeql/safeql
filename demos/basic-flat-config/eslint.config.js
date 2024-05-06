// @ts-check

import safeql from "@ts-safeql/eslint-plugin/config";
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommendedTypeCheckedOnly,
  safeql.configs.connections({
    databaseUrl: "postgres://postgres:postgres@localhost:5432/safeql_basic_flat_config",
    targets: [{ tag: "sql", transform: "{type}[]" }],
  })
);
