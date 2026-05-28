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

RuleTester.describe("postgres-js integration", () => {
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
      CREATE TABLE users (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        name TEXT NOT NULL,
        age INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        user_id INTEGER NOT NULL REFERENCES users(id)
      );

      CREATE TABLE ticket (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        username TEXT NOT NULL,
        account INTEGER NOT NULL
      );

      CREATE TABLE camel_case (
        a_test INTEGER,
        b_test TEXT
      );

      INSERT INTO users (name, age) VALUES
        ('Murray', 68),
        ('Walter', 80);

      INSERT INTO accounts (user_id) VALUES
        (1),
        (2);
    `);
  });

  RuleTester.afterAll(async () => {
    await sql.end();
    await dropFn();
  });

  const postgresJsConnection = {
    databaseUrl: `postgres://postgres:postgres@localhost:5432/${databaseName}`,
    plugins: [{ package: "@ts-safeql/plugin-postgres-js", config: {} }] satisfies PluginDescriptor[],
    keepAlive: false,
  };

  function withConnection(overrides?: Record<string, unknown>) {
    return [{ connections: [{ ...postgresJsConnection, ...overrides }] }];
  }

  const p = (code: string) => `import postgres from "postgres"; const sql = postgres(); ${code}`;
  const pWrapped = (code: string) => `import postgres from "postgres";
const sql = postgres();
const section = (_name: string, callback: () => unknown) => callback();
const example = (_name: string, callback: () => unknown) => callback();
section("wrapped", () => {
  example("case", () => {
    ${code};
  });
});`;

  ruleTester.run("plain sql tags", rules["check-sql"], {
    valid: [],
    invalid: [
      {
        name: "valid query still requires type annotation",
        options: withConnection(),
        code: p("sql`SELECT id, name FROM users`"),
        output: p("sql<{ id: number; name: string }[]>`SELECT id, name FROM users`"),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "invalid column is reported",
        options: withConnection(),
        code: p("sql`SELECT nonexistent FROM users`"),
        errors: [{ messageId: "invalidQuery" }],
      },
      {
        name: "parameterized query still requires type annotation",
        options: withConnection(),
        code: p("sql`SELECT * FROM users WHERE age > ${60}`"),
        output: p(
          "sql<{ id: number; name: string; age: number; created_at: Date; updated_at: Date }[]>`SELECT * FROM users WHERE age > ${60}`",
        ),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
    ],
  });

  ruleTester.run("query modifiers", rules["check-sql"], {
    valid: [
      {
        name: "copy writable query is valid",
        options: withConnection(),
        code: p("sql`COPY users (name, age) FROM STDIN`.writable()"),
      },
      {
        name: "copy readable query is valid",
        options: withConnection(),
        code: p("sql`COPY users (name, age) TO STDOUT`.readable()"),
      },
    ],
    invalid: [
      {
        name: "raw modifier is linted",
        options: withConnection(),
        code: p("sql`SELECT id FROM users`.raw()"),
        output: p('sql<{ id: number }[]>`SELECT id FROM users`.raw()'),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "describe modifier is linted",
        options: withConnection(),
        code: p("sql`SELECT id FROM users`.describe()"),
        output: p('sql<{ id: number }[]>`SELECT id FROM users`.describe()'),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "execute modifier is linted",
        options: withConnection(),
        code: p("sql`SELECT id FROM users`.execute()"),
        output: p('sql<{ id: number }[]>`SELECT id FROM users`.execute()'),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "cursor modifier is linted",
        options: withConnection(),
        code: p("sql`SELECT id FROM users`.cursor()"),
        output: p('sql<{ id: number }[]>`SELECT id FROM users`.cursor()'),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "forEach modifier is linted",
        options: withConnection(),
        code: p("sql`SELECT id FROM users`.forEach(() => {})"),
        output: p('sql<{ id: number }[]>`SELECT id FROM users`.forEach(() => {})'),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "simple modifier still catches multiple statements",
        options: withConnection(),
        code: p("sql`SELECT 1; SELECT 2;`.simple()"),
        errors: [{ messageId: "invalidQuery" }],
      },
    ],
  });

  ruleTester.run("helper expressions", rules["check-sql"], {
    valid: [],
    invalid: [
      {
        name: "identifier helper from string is linted",
        options: withConnection(),
        code: p('sql`SELECT ${sql("id")} FROM ${sql("users")}`'),
        output: p('sql<{ id: number }[]>`SELECT ${sql("id")} FROM ${sql("users")}`'),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "dynamic column helper is linted",
        options: withConnection(),
        code: p('const columns = ["name", "age"]; sql`SELECT ${sql(columns)} FROM users`'),
        output: p(
          'const columns = ["name", "age"]; sql<{ name: string; age: number }[]>`SELECT ${sql(columns)} FROM users`',
        ),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "multiple identifier helper is linted",
        options: withConnection(),
        code: p('sql`SELECT ${sql("name", "age")} FROM users`'),
        output: p('sql<{ name: string; age: number }[]>`SELECT ${sql("name", "age")} FROM users`'),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "dynamic insert helper is linted",
        options: withConnection(),
        code: p(
          'const user = { name: "Murray", age: 68 }; sql`INSERT INTO users ${sql(user)} RETURNING id`',
        ),
        output: p(
          'const user = { name: "Murray", age: 68 }; sql<{ id: number }[]>`INSERT INTO users ${sql(user)} RETURNING id`',
        ),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "dynamic insert helper with column array is linted",
        options: withConnection(),
        code: p(
          'const columns = ["name", "age"] as const; const user = { name: "Walter", age: 80, ignored: true }; sql`INSERT INTO users ${sql(user, columns)} RETURNING id`',
        ),
        output: p(
          'const columns = ["name", "age"] as const; const user = { name: "Walter", age: 80, ignored: true }; sql<{ id: number }[]>`INSERT INTO users ${sql(user, columns)} RETURNING id`',
        ),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "dynamic update helper still catches bad columns",
        options: withConnection(),
        code: p(
          'const user = { id: 1, name: "Murray", age: 69 }; sql`UPDATE users SET ${sql(user, "name", "age")} WHERE nonexistent = ${user.id}`',
        ),
        errors: [{ messageId: "invalidQuery" }],
      },
      {
        name: "dynamic update helper with column array is linted",
        options: withConnection(),
        code: p(
          'const columns = ["name", "age"] as const; const user = { id: 1, name: "Murray", age: 69 }; sql`UPDATE users SET ${sql(user, columns)} WHERE id = ${user.id} RETURNING id`',
        ),
        output: p(
          'const columns = ["name", "age"] as const; const user = { id: 1, name: "Murray", age: 69 }; sql<{ id: number }[]>`UPDATE users SET ${sql(user, columns)} WHERE id = ${user.id} RETURNING id`',
        ),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "multi-row insert helper with selected columns is linted",
        options: withConnection(),
        code: p(
          'const users = [{ name: "Murray", age: 68, ignored: true }, { name: "Walter", age: 80, ignored: false }]; sql`INSERT INTO users ${sql(users, "name", "age")} RETURNING id`',
        ),
        output: p(
          'const users = [{ name: "Murray", age: 68, ignored: true }, { name: "Walter", age: 80, ignored: false }]; sql<{ id: number }[]>`INSERT INTO users ${sql(users, "name", "age")} RETURNING id`',
        ),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "array helper in IN clause is linted",
        options: withConnection(),
        code: p("sql`SELECT id FROM users WHERE age IN ${sql([68, 75, 23])}`"),
        output: p("sql<{ id: number }[]>`SELECT id FROM users WHERE age IN ${sql([68, 75, 23])}`"),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "array helper in VALUES clause is linted",
        options: withConnection(),
        code: p(
          'sql`SELECT data.a::text AS a, data.b::text AS b, data.c::text AS c FROM (VALUES ${sql(["a", "b", "c"])}) AS data(a, b, c)`',
        ),
        output: p(
          'sql<{ a: string | null; b: string | null; c: string | null }[]>`SELECT data.a::text AS a, data.b::text AS b, data.c::text AS c FROM (VALUES ${sql(["a", "b", "c"])}) AS data(a, b, c)`',
        ),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "matrix helper in VALUES clause is linted",
        options: withConnection(),
        code: p(
          'const rows = [[1, "John"], [2, "Jane"]]; sql`SELECT data.id::int AS id, data.name::text AS name FROM (VALUES ${sql(rows)}) AS data(id, name)`',
        ),
        output: p(
          'const rows = [[1, "John"], [2, "Jane"]]; sql<{ id: number | null; name: string | null }[]>`SELECT data.id::int AS id, data.name::text AS name FROM (VALUES ${sql(rows)}) AS data(id, name)`',
        ),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
    ],
  });

  ruleTester.run("nested fragments", rules["check-sql"], {
    valid: [
      {
        name: "inline sql fragment expression is valid",
        options: withConnection(),
        code: p(
          "sql<{ id: number; name: string; age: number; created_at: Date; updated_at: Date }[]>`SELECT * FROM users ${sql`WHERE id = ${1}`}`",
        ),
      },
      {
        name: "fragment variable used later is valid",
        options: withConnection(),
        code: p(
          "const where = sql`WHERE id = ${1}`; function run() { sql<{ id: number; name: string; age: number; created_at: Date; updated_at: Date }[]>`SELECT * FROM users ${where}` }",
        ),
      },
      {
        name: "inline sql fragment expression inside callback is valid",
        options: withConnection(),
        code: pWrapped(
          "void sql<{ id: number; name: string; age: number; created_at: Date; updated_at: Date }[]>`SELECT * FROM users ${sql`WHERE id = ${1}`}`",
        ),
      },
    ],
    invalid: [
      {
        name: "nested sql fragment variable is linted",
        options: withConnection(),
        code: p("const where = sql`WHERE id = ${1}`; sql`SELECT * FROM users ${where}`"),
        output: p(
          "const where = sql`WHERE id = ${1}`; sql<{ id: number; name: string; age: number; created_at: Date; updated_at: Date }[]>`SELECT * FROM users ${where}`",
        ),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "invalid SQL inside nested fragment is reported",
        options: withConnection(),
        code: p("const where = sql`WHERE nonexistent = ${1}`; sql`SELECT * FROM users ${where}`"),
        errors: [{ messageId: "invalidQuery" }],
      },
      {
        name: "raw ordering fragment is linted",
        options: withConnection(),
        code: p("sql`SELECT * FROM users ORDER BY ${sql`age DESC`}`"),
        output: p(
          "sql<{ id: number; name: string; age: number; created_at: Date; updated_at: Date }[]>`SELECT * FROM users ORDER BY ${sql`age DESC`}`",
        ),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
    ],
  });

  ruleTester.run("typed helpers", rules["check-sql"], {
    valid: [],
    invalid: [
      {
        name: "inline sql.typed helper is linted",
        options: withConnection(),
        code: p("sql`SELECT ${sql.typed([13, 37, 42, 80], 1337)}::text AS typed`"),
        output: p(
          "sql<{ typed: string | null }[]>`SELECT ${sql.typed([13, 37, 42, 80], 1337)}::text AS typed`",
        ),
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        name: "named sql.typed helper is linted",
        options: withConnection(),
        code: `import postgres from "postgres";
const sql = postgres({
  types: {
    rect: {
      to: 1337,
      from: [1337],
      serialize: (rectangle: { x: number; y: number; width: number; height: number }) => [
        rectangle.x,
        rectangle.y,
        rectangle.width,
        rectangle.height,
      ],
      parse: ([x, y, width, height]: [number, number, number, number]) => ({ x, y, width, height }),
    },
  },
});
sql\`SELECT \${sql.typed.rect({ x: 13, y: 37, width: 42, height: 80 })} AS rect\``,
        output: `import postgres from "postgres";
const sql = postgres({
  types: {
    rect: {
      to: 1337,
      from: [1337],
      serialize: (rectangle: { x: number; y: number; width: number; height: number }) => [
        rectangle.x,
        rectangle.y,
        rectangle.width,
        rectangle.height,
      ],
      parse: ([x, y, width, height]: [number, number, number, number]) => ({ x, y, width, height }),
    },
  },
});
sql<{ rect: string | null }[]>\`SELECT \${sql.typed.rect({ x: 13, y: 37, width: 42, height: 80 })} AS rect\``,
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
    ],
  });
});
