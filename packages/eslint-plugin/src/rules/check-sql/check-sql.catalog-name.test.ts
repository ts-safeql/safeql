import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

ruleTester.run("PostgreSQL name values", checkSqlRule, {
  valid: [
    {
      name: "name cast returns a string",
      options: withConnection(connections.withTag),
      code: "sql<{ value: string }>`SELECT 'example'::name AS value`",
    },
    {
      name: "catalog names return strings",
      options: withConnection(connections.withTag),
      code: "sql<{ value: string }>`SELECT nspname AS value FROM pg_catalog.pg_namespace`",
    },
    {
      name: "current_schema preserves possible null",
      options: withConnection(connections.withTag),
      code: "sql<{ value: string | null }>`SELECT current_schema() AS value`",
    },
  ],
  invalid: [
    {
      name: "incorrect catalog-name annotation is repaired",
      options: withConnection(connections.withTag),
      code: "sql<{ value: number }>`SELECT nspname AS value FROM pg_catalog.pg_namespace`",
      output: "sql<{ value: string }>`SELECT nspname AS value FROM pg_catalog.pg_namespace`",
      errors: [{ messageId: "incorrectTypeAnnotations" }],
    },
    {
      name: "current_schema cannot promise a nonnull string",
      options: withConnection(connections.withTag),
      code: "sql<{ value: string }>`SELECT current_schema() AS value`",
      output: "sql<{ value: string | null }>`SELECT current_schema() AS value`",
      errors: [{ messageId: "incorrectTypeAnnotations" }],
    },
  ],
});
