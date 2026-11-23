import { defineConfig } from "eslint/config";
import { expect, test } from "vitest";
import safeql from "./config";

test("config helpers fit inside ESLint's defineConfig", () => {
  const configs = defineConfig(
    safeql.configs.useConfigFile,
    safeql.configs.connections({
      databaseUrl: "postgres://localhost/db",
      targets: [{ tag: "sql" }],
    }),
  );

  expect(configs.map((config) => config.rules?.["@ts-safeql/check-sql"])).toEqual([
    ["error", { useConfigFile: true }],
    [
      "error",
      { connections: { databaseUrl: "postgres://localhost/db", targets: [{ tag: "sql" }] } },
    ],
  ]);
});
