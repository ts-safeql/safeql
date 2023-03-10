import { defineConfig } from "@ts-safeql/eslint-plugin";

export default defineConfig({
  connections: {
    databaseUrl: "postgres://postgres:postgres@localhost:5432/safeql_big_project",
    tagName: "sql",
    transform: "{type}[]",
  },
});
