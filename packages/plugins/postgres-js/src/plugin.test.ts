import { afterAll, describe, expect, it } from "vitest";
import { PluginTestDriver, type ToSQLResult } from "@ts-safeql/plugin-utils/testing";
import plugin from "./plugin";

const driver = new PluginTestDriver({
  plugin: plugin.factory({}),
  projectDir: process.cwd(),
});

afterAll(() => driver.teardown());

type Case = {
  name: string;
  source: string;
  output: ToSQLResult;
};

const cases: Case[] = [
  {
    name: "plain sql tag",
    source: 'import postgres from "postgres"; const sql = postgres(); sql`SELECT 1`',
    output: { sql: "SELECT 1" },
  },
  {
    name: "target matching through query modifiers",
    source: 'import postgres from "postgres"; const sql = postgres(); sql`SELECT 1`.values()',
    output: { sql: "SELECT 1" },
  },
  {
    name: "target matching through raw query modifier",
    source: 'import postgres from "postgres"; const sql = postgres(); sql`SELECT 1`.raw()',
    output: { sql: "SELECT 1" },
  },
  {
    name: "target matching through describe query modifier",
    source: 'import postgres from "postgres"; const sql = postgres(); sql`SELECT 1`.describe()',
    output: { sql: "SELECT 1" },
  },
  {
    name: "target matching through execute query modifier",
    source: 'import postgres from "postgres"; const sql = postgres(); sql`SELECT 1`.execute()',
    output: { sql: "SELECT 1" },
  },
  {
    name: "target matching through cursor query modifier",
    source: 'import postgres from "postgres"; const sql = postgres(); sql`SELECT 1`.cursor()',
    output: { sql: "SELECT 1" },
  },
  {
    name: "target matching through forEach query modifier",
    source:
      'import postgres from "postgres"; const sql = postgres(); sql`SELECT 1`.forEach(() => {})',
    output: { sql: "SELECT 1" },
  },
  {
    name: "dynamic column helper",
    source:
      'import postgres from "postgres"; const sql = postgres(); const columns = ["name", "age"]; sql`SELECT ${sql(columns)} FROM users`',
    output: { sql: 'SELECT "name", "age" FROM users' },
  },
  {
    name: "dynamic insert helper with selected columns",
    source:
      'import postgres from "postgres"; const sql = postgres(); const user = { name: "Murray", age: 68 }; sql`INSERT INTO users ${sql(user, "name", "age")}`',
    output: { sql: 'INSERT INTO users ("name", "age") values ($N, $N)' },
  },
  {
    name: "dynamic insert helper with selected column array",
    source:
      'import postgres from "postgres"; const sql = postgres(); const columns = ["name", "age"] as const; const user = { name: "Murray", age: 68, ignored: true }; sql`INSERT INTO users ${sql(user, columns)}`',
    output: { sql: 'INSERT INTO users ("name", "age") values ($N, $N)' },
  },
  {
    name: "dynamic insert helper with inferred columns",
    source:
      'import postgres from "postgres"; const sql = postgres(); const user = { name: "Murray", age: 68 }; sql`INSERT INTO users ${sql(user)}`',
    output: { sql: 'INSERT INTO users ("name", "age") values ($N, $N)' },
  },
  {
    name: "multi-row insert helper",
    source:
      'import postgres from "postgres"; const sql = postgres(); const users = [{ name: "Murray", age: 68 }, { name: "Walter", age: 80 }]; sql`INSERT INTO users ${sql(users)}`',
    output: { sql: 'INSERT INTO users ("name", "age") values ($N, $N), ($N, $N)' },
  },
  {
    name: "multi-row insert helper with selected columns",
    source:
      'import postgres from "postgres"; const sql = postgres(); const users = [{ name: "Murray", age: 68, ignored: true }, { name: "Walter", age: 80, ignored: false }]; sql`INSERT INTO users ${sql(users, "name", "age")}`',
    output: { sql: 'INSERT INTO users ("name", "age") values ($N, $N), ($N, $N)' },
  },
  {
    name: "array value helper",
    source:
      'import postgres from "postgres"; const sql = postgres(); sql`SELECT * FROM users WHERE age IN ${sql([68, 75, 23])}`',
    output: { sql: "SELECT * FROM users WHERE age IN ($N, $N, $N)" },
  },
  {
    name: "array value helper in VALUES clause",
    source:
      'import postgres from "postgres"; const sql = postgres(); sql`SELECT * FROM (VALUES ${sql(["a", "b", "c"])}) AS data(a, b, c)`',
    output: { sql: "SELECT * FROM (VALUES ($N, $N, $N)) AS data(a, b, c)" },
  },
  {
    name: "matrix values helper",
    source:
      'import postgres from "postgres"; const sql = postgres(); const users = [[1, "John"], [2, "Jane"]]; sql`SELECT * FROM (VALUES ${sql(users)}) AS data(id, name)`',
    output: { sql: "SELECT * FROM (VALUES ($N, $N), ($N, $N)) AS data(id, name)" },
  },
  {
    name: "nested sql fragment variable",
    source:
      'import postgres from "postgres"; const sql = postgres(); const where = sql`WHERE id = ${1}`; sql`SELECT * FROM users ${where}`',
    output: { sql: "SELECT * FROM users WHERE id = $N" },
  },
  {
    name: "nested sql fragment expression",
    source:
      'import postgres from "postgres"; const sql = postgres(); sql`SELECT * FROM users ${sql`WHERE id = ${1}`}`',
    output: { sql: "SELECT * FROM users WHERE id = $N" },
  },
  {
    name: "identifier helper from string",
    source:
      'import postgres from "postgres"; const sql = postgres(); sql`SELECT ${sql("id")} FROM ${sql("users")}`',
    output: { sql: 'SELECT "id" FROM "users"' },
  },
  {
    name: "identifier helper from multiple strings",
    source:
      'import postgres from "postgres"; const sql = postgres(); sql`SELECT ${sql("name", "age")} FROM users`',
    output: { sql: 'SELECT "name", "age" FROM users' },
  },
  {
    name: "raw sql fragment helper",
    source:
      'import postgres from "postgres"; const sql = postgres(); sql`SELECT * FROM users ORDER BY ${sql`age DESC`}`',
    output: { sql: "SELECT * FROM users ORDER BY age DESC" },
  },
  {
    name: "typed helper",
    source:
      'import postgres from "postgres"; const sql = postgres(); sql`SELECT ${sql.typed([13, 37, 42, 80], 1337)}`',
    output: { sql: "SELECT $N" },
  },
  {
    name: "named typed helper",
    source: `import postgres from "postgres";
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
sql\`SELECT \${sql.typed.rect({ x: 13, y: 37, width: 42, height: 80 })}\``,
    output: { sql: "SELECT $N" },
  },
  {
    name: "unsafe helper embedded in template",
    source:
      'import postgres from "postgres"; const sql = postgres(); const password = "postgres"; sql`CREATE ROLE friend_service WITH LOGIN PASSWORD ${sql.unsafe(`\'${password}\'`)}`',
    output: { sql: "CREATE ROLE friend_service WITH LOGIN PASSWORD 'postgres'" },
  },
  {
    name: "copy writable query",
    source:
      'import postgres from "postgres"; const sql = postgres(); sql`COPY users (name, age) FROM STDIN`.writable()',
    output: { sql: "COPY users (name, age) FROM STDIN" },
  },
  {
    name: "copy readable query",
    source:
      'import postgres from "postgres"; const sql = postgres(); sql`COPY users (name, age) TO STDOUT`.readable()',
    output: { sql: "COPY users (name, age) TO STDOUT" },
  },
  {
    name: "transaction tag via begin",
    source:
      'import postgres from "postgres"; const sql = postgres(); sql.begin((tx) => tx`SELECT 1`)',
    output: { sql: "SELECT 1" },
  },
  {
    name: "transaction tag via savepoint",
    source:
      'import postgres from "postgres"; const sql = postgres(); sql.begin((tx) => tx.savepoint((sp) => sp`SELECT 1`))',
    output: { sql: "SELECT 1" },
  },
  {
    name: "reserved connection tag",
    source:
      'import postgres from "postgres"; const sql = postgres(); async function run() { const reserved = await sql.reserve(); return reserved`SELECT 1`; }',
    output: { sql: "SELECT 1" },
  },
  {
    // Mirrors postgres.js: the `in` builder maps an empty array's "()" to "(null)".
    name: "array value helper with empty array",
    source:
      'import postgres from "postgres"; const sql = postgres(); sql`SELECT * FROM users WHERE age IN ${sql([])}`',
    output: { sql: "SELECT * FROM users WHERE age IN (null)" },
  },
  {
    // Mirrors postgres.js: the `values` builder emits "()" for an empty array.
    name: "values helper with empty array",
    source:
      'import postgres from "postgres"; const sql = postgres(); sql`SELECT * FROM (VALUES ${sql([])}) AS data(a)`',
    output: { sql: "SELECT * FROM (VALUES ()) AS data(a)" },
  },
  {
    // Resolution follows the last-positioned keyword, so a trailing `AS` from an
    // unrelated CAST selects the `as`/select builder — same as postgres.js.
    name: "helper resolves via the last keyword (CAST ... AS parity)",
    source:
      'import postgres from "postgres"; const sql = postgres(); const row = { status: "active" }; sql`SELECT CAST(created_at AS date), ${sql(row)}`',
    output: { sql: 'SELECT CAST(created_at AS date), $N AS "status"' },
  },
];

describe("postgres-js plugin", () => {
  for (const testCase of cases) {
    it(testCase.name, () => {
      expect(driver.toSQL(testCase.source)).toEqual(testCase.output);
    });
  }
});
