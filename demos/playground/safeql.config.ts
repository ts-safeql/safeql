import { defineConfig } from "@ts-safeql/eslint-plugin";

export default defineConfig({
  connections: {
    migrationsDir: "migrations",
    targets: [{ tag: "sql", transform: "{type}[]" }],
  },
});
