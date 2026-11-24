import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

ruleTester.run("advisory-lock projections", checkSqlRule, {
  valid: [
    {
      name: "explicit null-as-failure policy produces a nonnull boolean",
      options: withConnection(connections.withTag),
      code: "declare const key: string; sql<{ locked: boolean }>`SELECT COALESCE(pg_try_advisory_xact_lock(hashtextextended(${key}, 0)), false) AS locked`",
    },
    {
      name: "literal key produces a nonnull boolean",
      options: withConnection(connections.withTag),
      code: "sql<{ locked: boolean }>`SELECT pg_try_advisory_xact_lock(1::bigint) AS locked`",
    },
    {
      name: "hashed literal key produces a nonnull boolean",
      options: withConnection(connections.withTag),
      code: "sql<{ locked: boolean }>`SELECT pg_try_advisory_xact_lock(hashtextextended('probe', 0)) AS locked`",
    },
    {
      name: "null key preserves nullability",
      options: withConnection(connections.withTag),
      code: "sql<{ locked: boolean | null }>`SELECT pg_try_advisory_xact_lock(NULL::bigint) AS locked`",
    },
    {
      name: "parameterized hashed key has a known boolean type but may be null in SQL",
      options: withConnection(connections.withTag),
      code: "declare const key: string; sql<{ locked: boolean | null }>`SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked`",
    },
  ],
  invalid: [
    {
      name: "generated boolean annotation passes the next check",
      options: withConnection(connections.withTag),
      code: "sql`SELECT pg_try_advisory_xact_lock(hashtextextended('probe', 0)) AS locked`",
      output:
        "sql<{ locked: boolean }>`SELECT pg_try_advisory_xact_lock(hashtextextended('probe', 0)) AS locked`",
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "parameterized key cannot promise nonnull output",
      options: withConnection(connections.withTag),
      code: "declare const key: string; sql<{ locked: boolean }>`SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked`",
      output:
        "declare const key: string; sql<{ locked: boolean | null }>`SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked`",
      errors: [{ messageId: "incorrectTypeAnnotations" }],
    },
  ],
});
