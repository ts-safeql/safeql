import { test } from "vitest";
import { setupGenerateTest } from "./generate.test-setup";
import type { ResolvedTarget } from "../generate";

const testQuery = setupGenerateTest();
const boolean = { kind: "type", value: "boolean", type: "bool" } as const;
const nullableBoolean: ResolvedTarget = {
  kind: "union",
  value: [boolean, { kind: "type", value: "null", type: "null" }],
};

test("explicit null-as-failure SQL produces a nonnull boolean for a parameterized key", async () => {
  await testQuery({
    query:
      "SELECT COALESCE(pg_try_advisory_xact_lock(hashtextextended($1::text, 0)), false) AS locked",
    expected: [["locked", boolean]],
  });
});

test.each([
  "pg_try_advisory_xact_lock(1::bigint)",
  "pg_try_advisory_xact_lock(1, 2)",
  "pg_catalog.pg_try_advisory_xact_lock(1::bigint)",
  "pg_try_advisory_lock(1::bigint)",
  "pg_try_advisory_xact_lock_shared(1::bigint)",
  "pg_try_advisory_lock_shared(1::bigint)",
  "pg_try_advisory_xact_lock(hashtextextended('probe', 0))",
])("a proven nonnull advisory key returns boolean: %s", async (expression) => {
  await testQuery({ query: `SELECT ${expression} AS locked`, expected: [["locked", boolean]] });
});

test.each([
  "pg_try_advisory_xact_lock(NULL::bigint)",
  "pg_try_advisory_xact_lock(1, NULL::int)",
  "pg_try_advisory_xact_lock($1::bigint)",
  "pg_try_advisory_xact_lock(hashtextextended($1::text, 0))",
])("a nullable advisory key retains null: %s", async (expression) => {
  await testQuery({
    query: `SELECT ${expression} AS locked`,
    expected: [["locked", nullableBoolean]],
  });
});

test("unknown scalar function inference uses PostgreSQL's resolved result type", async () => {
  await testQuery({
    schema: "CREATE FUNCTION scalar_probe(integer) RETURNS integer LANGUAGE SQL AS 'SELECT $1'",
    query: "SELECT scalar_probe(1) AS value",
    expected: [
      [
        "value",
        {
          kind: "union",
          value: [
            { kind: "type", value: "number", type: "int4" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("unknown scalar fallback respects configured result-type mappings", async () => {
  await testQuery({
    overrides: { types: { bool: "BooleanResult" } },
    query: "SELECT pg_try_advisory_xact_lock(hashtextextended($1::text, 0)) AS locked",
    expected: [
      [
        "locked",
        {
          kind: "union",
          value: [
            { kind: "type", value: "BooleanResult", type: "bool" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("a similarly named function outside pg_catalog does not acquire the builtin null guarantee", async () => {
  await testQuery({
    schema: `CREATE SCHEMA advisory_probe;
      CREATE FUNCTION advisory_probe.pg_try_advisory_xact_lock(bigint) RETURNS boolean
      LANGUAGE SQL AS 'SELECT NULL::boolean'`,
    query: "SELECT advisory_probe.pg_try_advisory_xact_lock(1::bigint) AS locked",
    expected: [["locked", nullableBoolean]],
  });
});

test("unmapped result types stay unknown rather than becoming any", async () => {
  await testQuery({
    schema: `CREATE TYPE scalar_pair AS (value integer);
      CREATE FUNCTION pair_probe() RETURNS scalar_pair LANGUAGE SQL AS 'SELECT ROW(1)::scalar_pair'`,
    query: "SELECT pair_probe() AS value",
    expected: [
      [
        "value",
        {
          kind: "union",
          value: [
            { kind: "type", value: "unknown", type: "unknown" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});
