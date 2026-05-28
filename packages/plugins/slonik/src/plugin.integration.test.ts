import { generateTestDatabaseName, setupTestDatabase } from "@ts-safeql/test-utils";
import { RuleTester } from "@typescript-eslint/rule-tester";
import parser from "@typescript-eslint/parser";
import path from "path";
import { Sql } from "postgres";
import { afterAll, beforeAll, describe, it } from "vitest";
import { rules } from "@ts-safeql/eslint-plugin";
import type { PluginDescriptor } from "@ts-safeql/plugin-utils";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.afterAll = afterAll;

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: {
      projectService: true,
      tsconfigRootDir: path.resolve(__dirname, "./ts-fixture"),
    },
  },
});

RuleTester.describe("slonik integration", () => {
  const databaseName = generateTestDatabaseName();
  let sql!: Sql;
  let dropFn!: () => Promise<unknown>;

  beforeAll(async () => {
    const testDatabase = await setupTestDatabase({
      databaseName,
      postgresUrl: "postgres://postgres:postgres@localhost:5432/postgres",
    });

    dropFn = testDatabase.drop;
    sql = testDatabase.sql;

    await sql.unsafe(`
      CREATE TABLE person (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        name TEXT NOT NULL,
        bio TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  });

  RuleTester.afterAll(async () => {
    await sql.end();
    await dropFn();
  });

  const slonikConnection = {
    databaseUrl: `postgres://postgres:postgres@localhost:5432/${databaseName}`,
    plugins: [{ package: "@ts-safeql/plugin-slonik", config: {} }] satisfies PluginDescriptor[],
    keepAlive: false,
  };

  function withConnection(overrides?: Record<string, unknown>) {
    return [{ connections: [{ ...slonikConnection, ...overrides }] }];
  }

  const s = (code: string) => `import { sql } from "slonik"; ${code}`;
  const sz = (code: string) => `import { sql } from "slonik"; import { z } from "zod"; ${code}`;

  ruleTester.run("sql.unsafe", rules["check-sql"], {
    valid: [
      { name: "valid query", options: withConnection(), code: s("sql.unsafe`SELECT 1 AS id`") },
      {
        name: "with type annotation",
        options: withConnection(),
        code: s("sql.unsafe<{ id: number }>`SELECT 1 AS id`"),
      },
    ],
    invalid: [
      {
        name: "invalid column",
        options: withConnection(),
        code: s("sql.unsafe`SELECT nonexistent FROM person`"),
        errors: [{ messageId: "invalidQuery" }],
      },
      {
        name: "invalid table",
        options: withConnection(),
        code: s("sql.unsafe`SELECT 1 FROM nonexistent`"),
        errors: [{ messageId: "invalidQuery" }],
      },
    ],
  });

  ruleTester.run("sql.typeAlias", rules["check-sql"], {
    valid: [
      {
        name: "valid query, no type annotation needed",
        options: withConnection(),
        code: s('sql.typeAlias("id")`SELECT id FROM person`'),
      },
    ],
    invalid: [
      {
        name: "invalid column still caught",
        options: withConnection(),
        code: s('sql.typeAlias("id")`SELECT nonexistent FROM person`'),
        errors: [{ messageId: "invalidQuery" }],
      },
    ],
  });

  ruleTester.run("sql.fragment", rules["check-sql"], {
    valid: [
      {
        name: "standalone — not linted",
        options: withConnection(),
        code: s("sql.fragment`WHERE id = 1`"),
      },
      {
        name: "invalid SQL inside fragment — not validated",
        options: withConnection(),
        code: s("sql.fragment`TOTAL GARBAGE`"),
      },
    ],
    invalid: [],
  });

  ruleTester.run("sql.type — inline schema", rules["check-sql"], {
    valid: [
      {
        name: "correct schema",
        options: withConnection(),
        code: sz(
          "sql.type(z.object({ id: z.number(), name: z.string() }))`SELECT id, name FROM person`",
        ),
      },
      {
        name: "nullable column",
        options: withConnection(),
        code: sz("sql.type(z.object({ bio: z.string().nullable() }))`SELECT bio FROM person`"),
      },
    ],
    invalid: [
      {
        name: "wrong field type → suggestion by default",
        options: withConnection(),
        code: sz(
          "sql.type(z.object({ id: z.string(), name: z.string() }))`SELECT id, name FROM person`",
        ),
        errors: [
          {
            messageId: "pluginError",
            suggestions: [
              {
                messageId: "pluginSuggestion",
                output: sz(
                  "sql.type(z.object({ id: z.number(), name: z.string() }))`SELECT id, name FROM person`",
                ),
              },
            ],
          },
        ],
      },
      {
        name: "missing field → suggestion by default",
        options: withConnection(),
        code: sz("sql.type(z.object({ id: z.number() }))`SELECT id, name FROM person`"),
        errors: [
          {
            messageId: "pluginError",
            suggestions: [
              {
                messageId: "pluginSuggestion",
                output: sz(
                  "sql.type(z.object({ id: z.number(), name: z.string() }))`SELECT id, name FROM person`",
                ),
              },
            ],
          },
        ],
      },
      {
        name: "extra field → suggestion by default",
        options: withConnection(),
        code: sz(
          "sql.type(z.object({ id: z.number(), name: z.string(), age: z.number() }))`SELECT id, name FROM person`",
        ),
        errors: [
          {
            messageId: "pluginError",
            suggestions: [
              {
                messageId: "pluginSuggestion",
                output: sz(
                  "sql.type(z.object({ id: z.number(), name: z.string() }))`SELECT id, name FROM person`",
                ),
              },
            ],
          },
        ],
      },
      {
        name: "nullable mismatch → suggestion by default",
        options: withConnection(),
        code: sz("sql.type(z.object({ bio: z.string() }))`SELECT bio FROM person`"),
        errors: [
          {
            messageId: "pluginError",
            suggestions: [
              {
                messageId: "pluginSuggestion",
                output: sz(
                  "sql.type(z.object({ bio: z.string().nullable() }))`SELECT bio FROM person`",
                ),
              },
            ],
          },
        ],
      },
      {
        name: "wrong field type → auto-fix when enforceType is fix",
        options: withConnection({ enforceType: "fix" }),
        code: sz(
          "sql.type(z.object({ id: z.string(), name: z.string() }))`SELECT id, name FROM person`",
        ),
        output: sz(
          "sql.type(z.object({ id: z.number(), name: z.string() }))`SELECT id, name FROM person`",
        ),
        errors: [{ messageId: "pluginError" }],
      },
    ],
  });

  ruleTester.run("sql.type — referenced schema variable", rules["check-sql"], {
    valid: [
      {
        name: "schema defined as const",
        options: withConnection(),
        code: sz(
          "const PersonRow = z.object({ id: z.number(), name: z.string() }); sql.type(PersonRow)`SELECT id, name FROM person`",
        ),
      },
    ],
    invalid: [],
  });

  ruleTester.run("expression helpers", rules["check-sql"], {
    valid: [
      {
        name: "sql.json → json parameter",
        options: withConnection(),
        code: s("sql.unsafe`SELECT ${sql.json({ a: 1 })}`"),
      },
      {
        name: "sql.jsonb → jsonb parameter",
        options: withConnection(),
        code: s("sql.unsafe`SELECT ${sql.jsonb([1, 2, 3])}`"),
      },
      {
        name: "sql.binary → bytea parameter",
        options: withConnection(),
        code: s('const buf = Buffer.from("x"); sql.unsafe`SELECT ${sql.binary(buf)}`'),
      },
      {
        name: "sql.date → date parameter",
        options: withConnection(),
        code: s("sql.unsafe`SELECT ${sql.date(new Date())}`"),
      },
      {
        name: "sql.timestamp → timestamptz parameter",
        options: withConnection(),
        code: s("sql.unsafe`SELECT ${sql.timestamp(new Date())}`"),
      },
      {
        name: "sql.interval → interval parameter",
        options: withConnection(),
        code: s("sql.unsafe`SELECT ${sql.interval({ days: 3 })}`"),
      },
      {
        name: "sql.uuid → uuid parameter",
        options: withConnection(),
        code: s('sql.unsafe`SELECT ${sql.uuid("00000000-0000-0000-0000-000000000000")}`'),
      },
      {
        name: "sql.array → typed array parameter",
        options: withConnection(),
        code: s('sql.unsafe`SELECT ${sql.array([1, 2, 3], "int4")}`'),
      },
      {
        name: "sql.array in ANY() pattern",
        options: withConnection(),
        code: s(
          'sql.unsafe`SELECT id FROM person WHERE id = ANY(${sql.array([1, 2, 3], "int4")})`',
        ),
      },
      {
        name: "sql.identifier — single name",
        options: withConnection(),
        code: s('sql.unsafe`SELECT id, name FROM ${sql.identifier(["person"])}`'),
      },
      {
        name: "sql.identifier — schema-qualified",
        options: withConnection(),
        code: s(
          'sql.unsafe`SELECT typname::text FROM ${sql.identifier(["pg_catalog", "pg_type"])} LIMIT 1`',
        ),
      },
      {
        name: "plain variable → default $N parameter",
        options: withConnection(),
        code: s("const x = 42; sql.unsafe`SELECT id FROM person WHERE id = ${x}`"),
      },
      {
        name: "multiple expressions in one query",
        options: withConnection(),
        code: s("sql.unsafe`SELECT ${sql.json({ a: 1 })} AS a, ${sql.json({ b: 2 })} AS b`"),
      },
    ],
    invalid: [],
  });

  ruleTester.run("fragment embedding", rules["check-sql"], {
    valid: [
      {
        name: "fragment variable → inline SQL",
        options: withConnection(),
        code: s(
          "const where = sql.fragment`WHERE id = 1`; sql.unsafe`SELECT * FROM person ${where}`",
        ),
      },
      {
        name: "nested fragments → inline SQL",
        options: withConnection(),
        code: s(
          "const cond = sql.fragment`id = 1`; const where = sql.fragment`WHERE ${cond}`; sql.unsafe`SELECT * FROM person ${where}`",
        ),
      },
      {
        name: "reused fragment in same template → inline SQL twice",
        options: withConnection(),
        code: s(
          "const cond = sql.fragment`id = 1`; const where = sql.fragment`WHERE ${cond} OR ${cond}`; sql.unsafe`SELECT * FROM person ${where}`",
        ),
      },
      {
        name: "fragment from parent block scope → inline SQL",
        options: withConnection(),
        code: s(
          "function query() { const where = sql.fragment`WHERE id = 1`; if (true) return sql.unsafe`SELECT * FROM person ${where}`; throw new Error('unreachable'); }",
        ),
      },
    ],
    invalid: [
      {
        name: "fragment with invalid SQL is caught",
        options: withConnection(),
        code: s(
          "const where = sql.fragment`WHERE nonexistent = 1`; sql.unsafe`SELECT * FROM person ${where}`",
        ),
        errors: [{ messageId: "invalidQuery" }],
      },
    ],
  });

  ruleTester.run("sql.unnest type extraction", rules["check-sql"], {
    valid: [
      {
        name: "sql.unnest with string type names",
        options: withConnection(),
        code: s(
          'sql.unsafe`SELECT bar, baz FROM ${sql.unnest([[1, "foo"], [2, "bar"]], ["int4", "text"])} AS foo(bar, baz)`',
        ),
      },
      {
        name: "dynamic identifier segment skips query",
        options: withConnection(),
        code: s(
          'const schema = "public"; sql.unsafe`SELE2CT * FROM ${sql.identifier([schema, "person"])}`',
        ),
      },
    ],
    invalid: [],
  });

  ruleTester.run("sql.literalValue embedding", rules["check-sql"], {
    valid: [
      {
        name: "sql.literalValue → embed as quoted literal",
        options: withConnection(),
        code: s('sql.unsafe`SELECT ${sql.literalValue("foo")}`'),
      },
    ],
    invalid: [],
  });

  ruleTester.run("sql.join (query skipped)", rules["check-sql"], {
    valid: [
      {
        name: "sql.join — comma separated",
        options: withConnection(),
        code: s("sql.unsafe`SELECT ${sql.join([1, 2, 3], sql.fragment`, `)}`"),
      },
      {
        name: "sql.join — boolean expression",
        options: withConnection(),
        code: s("sql.unsafe`SELECT ${sql.join([1, 2], sql.fragment` AND `)}`"),
      },
    ],
    invalid: [],
  });
});
