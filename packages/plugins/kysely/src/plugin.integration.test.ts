import { generateTestDatabaseName, setupTestDatabase } from "@ts-safeql/test-utils";
import { RuleTester } from "@typescript-eslint/rule-tester";
import parser from "@typescript-eslint/parser";
import path from "path";
import postgres, { Sql } from "postgres";
import { afterAll, beforeAll, describe, it } from "vitest";
import { rules } from "@ts-safeql/eslint-plugin";
import type { PluginDescriptor } from "@ts-safeql/plugin-utils";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.afterAll = afterAll;

const POSTGRES_URL = "postgres://postgres:postgres@localhost:5432/postgres";

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: {
      projectService: true,
      tsconfigRootDir: path.resolve(__dirname, "./ts-fixture"),
    },
  },
});

const kyselyPlugin = {
  package: "@ts-safeql/plugin-kysely",
  config: {},
} satisfies PluginDescriptor;

const k = (code: string) =>
  `import { sql, Kysely } from "kysely"; declare const db: Kysely<any>; ${code}`;

const withBuilderConnection = (databaseName: string, overrides?: Record<string, unknown>) => [
  {
    connections: [
      {
        databaseUrl: `postgres://postgres:postgres@localhost:5432/${databaseName}`,
        plugins: [{ ...kyselyPlugin, config: { builder: true } }],
        keepAlive: false,
        ...overrides,
      },
    ],
  },
];

RuleTester.describe("kysely integration — sql tag", () => {
  const databaseName = generateTestDatabaseName();
  let sql!: Sql;
  let dropFn!: () => Promise<unknown>;

  beforeAll(async () => {
    const testDatabase = await setupTestDatabase({ databaseName, postgresUrl: POSTGRES_URL });
    dropFn = testDatabase.drop;
    sql = testDatabase.sql;

    await sql.unsafe(`
      CREATE TABLE person (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        first_name TEXT NOT NULL,
        name TEXT NOT NULL,
        bio TEXT
      );
    `);
  });

  RuleTester.afterAll(async () => {
    await sql.end();
    await dropFn();
  });

  const withConnection = (overrides?: Record<string, unknown>) => [
    {
      connections: [
        {
          databaseUrl: `postgres://postgres:postgres@localhost:5432/${databaseName}`,
          plugins: [kyselyPlugin],
          keepAlive: false,
          ...overrides,
        },
      ],
    },
  ];

  ruleTester.run("check-sql", rules["check-sql"], {
    valid: [
      {
        name: "correct row type",
        options: withConnection(),
        code: k("sql<{ id: number; name: string }>`SELECT id, name FROM person`"),
      },
      {
        name: "nullable column",
        options: withConnection(),
        code: k("sql<{ bio: string | null }>`SELECT bio FROM person`"),
      },
      {
        name: "executed query",
        options: withConnection(),
        code: k("sql<{ id: number }>`SELECT id FROM person`.execute(db)"),
      },
      {
        // CamelCasePlugin users: snake_case columns map to camelCase via a
        // `fieldTransform: "camel"` target (the plugin keeps onTarget authority).
        name: "camelCase field transform",
        options: withConnection({ targets: [{ tag: "sql", fieldTransform: "camel" }] }),
        code: k("sql<{ firstName: string }>`SELECT first_name FROM person`"),
      },
    ],
    invalid: [
      {
        name: "nonexistent column",
        options: withConnection(),
        code: k("sql<{ id: number }>`SELECT nonexistent FROM person`"),
        errors: [{ messageId: "invalidQuery" }],
      },
      {
        name: "wrong column type",
        options: withConnection(),
        code: k("sql<{ id: string }>`SELECT id FROM person`"),
        output: k("sql<{ id: number }>`SELECT id FROM person`"),
        errors: [{ messageId: "incorrectTypeAnnotations" }],
      },
    ],
  });
});

RuleTester.describe("kysely integration — migrations", () => {
  // Sanitize to lowercase `[a-z0-9_]`: SafeQL's `CREATE DATABASE` is unquoted,
  // so a `-` (which nanoid may emit) or uppercase would break it.
  const databaseName = generateTestDatabaseName()
    .replace(/[^a-z0-9_]/gi, "_")
    .toLowerCase();

  RuleTester.afterAll(async () => {
    const root = postgres(POSTGRES_URL);
    try {
      await root.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    } finally {
      await root.end();
    }
  });

  const withMigrations = () => [
    {
      connections: [
        {
          migrationsDir: "src/__fixtures__/migrations",
          connectionUrl: POSTGRES_URL,
          databaseName,
          watchMode: false,
          plugins: [kyselyPlugin],
          keepAlive: false,
        },
      ],
    },
  ];

  ruleTester.run("check-sql", rules["check-sql"], {
    valid: [
      {
        name: "query against migrated schema",
        options: withMigrations(),
        code: k("sql<{ id: number; name: string }>`SELECT id, name FROM person`"),
      },
    ],
    invalid: [
      {
        name: "column missing from migrated schema",
        options: withMigrations(),
        code: k("sql<{ id: number }>`SELECT nonexistent FROM person`"),
        errors: [{ messageId: "invalidQuery" }],
      },
    ],
  });
});

RuleTester.describe("kysely integration — builder embedded sql (opt-in)", () => {
  const databaseName = generateTestDatabaseName();
  let sql!: Sql;
  let dropFn!: () => Promise<unknown>;

  beforeAll(async () => {
    const testDatabase = await setupTestDatabase({ databaseName, postgresUrl: POSTGRES_URL });
    dropFn = testDatabase.drop;
    sql = testDatabase.sql;

    await sql.unsafe(`
      CREATE TABLE person (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        first_name TEXT NOT NULL,
        name TEXT NOT NULL,
        bio TEXT
      );
    `);
  });

  RuleTester.afterAll(async () => {
    await sql.end();
    await dropFn();
  });

  // Builder mode compiles the whole chain — including its embedded `sql`
  // fragments — and validates the resulting SQL against the database. A pure
  // builder (no raw sql) is left to Kysely's own types.
  const kSql = (code: string) =>
    `import { Kysely, sql, type SqlBool } from "kysely";
interface DB { person: { id: number; first_name: string; name: string; bio: string | null } }
declare const db: Kysely<DB>;
${code}`;

  ruleTester.run("check-sql", rules["check-sql"], {
    valid: [
      {
        name: "embedded raw sql in .select(.as()) is validated",
        options: withBuilderConnection(databaseName),
        code: kSql(
          `db.selectFrom("person").select(sql<string>\`upper(first_name)\`.as("shout")).execute();`,
        ),
      },
      {
        name: "embedded raw sql in .where() is validated",
        options: withBuilderConnection(databaseName),
        code: kSql(`db.selectFrom("person").select("id").where(sql\`bio is not null\`).execute();`),
      },
      {
        name: "value interpolation in embedded sql is a bound param",
        options: withBuilderConnection(databaseName),
        code: kSql(
          `declare const min: number;
db.selectFrom("person").select("id").where(sql\`id > \${min}\`).execute();`,
        ),
      },
      {
        name: "pure builder (no embedded raw sql) is left to Kysely's types",
        options: withBuilderConnection(databaseName),
        code: kSql(`db.selectFrom("person").select(["id", "first_name"]).execute();`),
      },
      {
        name: "dynamic identifier in embedded sql is skipped",
        options: withBuilderConnection(databaseName),
        code: kSql(
          `declare const col: string;
db.selectFrom("person").select(sql\`\${sql.ref(col)}\`.as("x")).execute();`,
        ),
      },
      {
        name: "dynamic select callback is skipped",
        options: withBuilderConnection(databaseName),
        code: kSql(`db.selectFrom("person").select((eb) => eb.fn.countAll().as("n")).execute();`),
      },
    ],
    invalid: [
      {
        name: "nonexistent column in embedded sql is detected (squiggle on the fragment)",
        options: withBuilderConnection(databaseName),
        code: kSql(
          `db.selectFrom("person").select(sql<string>\`upper(nonexistent)\`.as("x")).execute();`,
        ),
        // The error must land on the embedded `sql` fragment, not a misplaced
        // offset in the compiled SQL.
        errors: [{ messageId: "invalidQuery", line: 4, column: 32 }],
      },
      {
        name: "invalid function in embedded sql is detected (squiggle on the fragment)",
        options: withBuilderConnection(databaseName),
        code: kSql(
          `db.selectFrom("person").select("id").where(sql<SqlBool>\`bogus_fn(id)\`).execute();`,
        ),
        errors: [{ messageId: "invalidQuery", line: 4, column: 44 }],
      },
    ],
  });
});
