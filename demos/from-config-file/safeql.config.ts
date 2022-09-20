import { defineConfig } from "@ts-safeql/eslint-plugin";

export default defineConfig({
  connections: {
    databaseUrl: "postgres://postgres:postgres@localhost:5432/safeql_from_config_file",
    tagName: "sql",
    transform: "${type}[]",
  },
});
