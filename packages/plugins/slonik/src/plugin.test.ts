import { describe, it, expect, afterAll } from "vitest";
import { PluginTestDriver, type ToSQLResult } from "@ts-safeql/plugin-utils/testing";
import plugin from "./plugin";

const driver = new PluginTestDriver({
  plugin: plugin.factory({}),
  projectDir: process.cwd(),
});

afterAll(() => driver.teardown());

type Case = {
  name: string;
  /** Extra imports. Set to `null` to omit the default slonik import. */
  imports?: string[] | null;
  input: string;
  output: ToSQLResult;
};

const cases: Case[] = [
  { name: "sql.unsafe", input: "sql.unsafe`SELECT 1`", output: { sql: "SELECT 1" } },
  {
    name: "aliased slonik import",
    imports: ['import { sql as slonikSql } from "slonik"'],
    input: "slonikSql.unsafe`SELECT 1`",
    output: { sql: "SELECT 1" },
  },
  { name: "sql.prepared", input: "sql.prepared`SELECT 1`", output: { sql: "SELECT 1" } },
  {
    name: "sql.typeAlias",
    input: 'sql.typeAlias("id")`SELECT 1 AS id`',
    output: { sql: "SELECT 1 AS id" },
  },
  {
    name: "sql.type with zod schema",
    imports: ['import { z } from "zod"'],
    input: "sql.type(z.object({ id: z.number() }))`SELECT 1 AS id`",
    output: { sql: "SELECT 1 AS id" },
  },
  {
    name: "sql.fragment (skipped)",
    input: "sql.fragment`WHERE id = 1`",
    output: { skipped: true },
  },
  {
    name: "non-slonik sql tag is ignored",
    imports: null,
    input: "const sql = { unsafe: String.raw }; sql.unsafe`TOTAL GARBAGE`",
    output: { skipped: true },
  },
  {
    name: "sql.identifier (multi)",
    input: 'sql.unsafe`SELECT * FROM ${sql.identifier(["public", "users"])}`',
    output: { sql: 'SELECT * FROM "public"."users"' },
  },
  {
    name: "sql.identifier (single)",
    input: 'sql.unsafe`SELECT * FROM ${sql.identifier(["users"])}`',
    output: { sql: 'SELECT * FROM "users"' },
  },
  {
    name: "sql.identifier escapes embedded quotes",
    input: 'sql.unsafe`SELECT * FROM ${sql.identifier(["foo\\"bar"])}`',
    output: { sql: 'SELECT * FROM "foo""bar"' },
  },
  {
    name: "sql.identifier with dynamic segment → query skipped",
    input:
      'const schema = "public"; sql.unsafe`SELECT * FROM ${sql.identifier([schema, "users"])}`',
    output: { sql: "SELECT * FROM /* skipped */" },
  },
  {
    name: "sql.json → ::json",
    input: "sql.unsafe`SELECT ${sql.json({ a: 1 })}`",
    output: { sql: "SELECT $N::json" },
  },
  {
    name: "sql.jsonb → ::jsonb",
    input: "sql.unsafe`SELECT ${sql.jsonb({ a: 1 })}`",
    output: { sql: "SELECT $N::jsonb" },
  },
  {
    name: "non-slonik helper methods are not translated",
    input:
      'const helper = { jsonb(value: string) { return value; } }; sql.unsafe`SELECT ${helper.jsonb("x")}`',
    output: { sql: "SELECT $1" },
  },
  {
    name: "sql.binary → ::bytea",
    input: 'const buf = Buffer.from("x"); sql.unsafe`SELECT ${sql.binary(buf)}`',
    output: { sql: "SELECT $N::bytea" },
  },
  {
    name: "sql.date → ::date",
    input: "sql.unsafe`SELECT ${sql.date(new Date())}`",
    output: { sql: "SELECT $N::date" },
  },
  {
    name: "sql.timestamp → ::timestamptz",
    input: "sql.unsafe`SELECT ${sql.timestamp(new Date())}`",
    output: { sql: "SELECT $N::timestamptz" },
  },
  {
    name: "sql.interval → ::interval",
    input: "sql.unsafe`SELECT ${sql.interval({ hours: 1 })}`",
    output: { sql: "SELECT $N::interval" },
  },
  {
    name: "sql.uuid → ::uuid",
    input: 'sql.unsafe`SELECT ${sql.uuid("a0ee-...")}`',
    output: { sql: "SELECT $N::uuid" },
  },
  {
    name: "sql.array (string type) → ::type[]",
    input: 'sql.unsafe`SELECT ${sql.array([1, 2, 3], "int4")}`',
    output: { sql: "SELECT $N::int4[]" },
  },
  {
    name: "sql.array (fragment type) → untyped $N",
    input: "sql.unsafe`SELECT ${sql.array([1, 2, 3], sql.fragment`int[]`)}`",
    output: { sql: "SELECT $N" },
  },
  {
    name: "sql.array (non-string literal type) → query skipped",
    input: "sql.unsafe`SELECT ${sql.array([1, 2, 3], 42)}`",
    output: { sql: "SELECT /* skipped */" },
  },
  {
    name: "fragment variable → inline SQL",
    input: "const where = sql.fragment`WHERE id = 1`; sql.unsafe`SELECT * FROM t ${where}`",
    output: { sql: "SELECT * FROM t WHERE id = 1" },
  },
  {
    name: "nested fragment → inline SQL",
    input:
      "const cond = sql.fragment`id = 1`; const where = sql.fragment`WHERE ${cond}`; sql.unsafe`SELECT * FROM t ${where}`",
    output: { sql: "SELECT * FROM t WHERE id = 1" },
  },
  {
    name: "reused fragment in same template → inline SQL twice",
    input:
      "const cond = sql.fragment`id = 1`; const where = sql.fragment`WHERE ${cond} OR ${cond}`; sql.unsafe`SELECT * FROM t ${where}`",
    output: { sql: "SELECT * FROM t WHERE id = 1 OR id = 1" },
  },
  {
    name: "fragment variable from parent block scope → inline SQL",
    input:
      "function query() { const where = sql.fragment`WHERE id = 1`; if (true) return sql.unsafe`SELECT * FROM t ${where}`; throw new Error('unreachable'); }",
    output: { sql: "SELECT * FROM t WHERE id = 1" },
  },
  {
    name: "destructured fragment variable → inline SQL",
    input:
      "const { where } = { where: sql.fragment`WHERE id = 1` }; sql.unsafe`SELECT * FROM t ${where}`",
    output: { sql: "SELECT * FROM t WHERE id = 1" },
  },
  {
    name: "fragment alias cycle falls back to placeholder",
    input: "const a: any = b; const b: any = a; sql.unsafe`SELECT ${a}`",
    output: { sql: "SELECT $1" },
  },
  {
    name: "sql.unnest → unnest($N::type[], ...)",
    input: 'sql.unsafe`SELECT * FROM ${sql.unnest([[1, "a"]], ["int4", "text"])}`',
    output: { sql: "SELECT * FROM unnest($N::int4[], $N::text[])" },
  },
  {
    name: "sql.unnest with dynamic type segment → query skipped",
    input:
      'const textType = "text"; sql.unsafe`SELECT * FROM ${sql.unnest([[1, "a"]], ["int4", textType])}`',
    output: { sql: "SELECT * FROM /* skipped */" },
  },
  {
    name: "sql.literalValue → embed as quoted literal",
    input: 'sql.unsafe`SELECT ${sql.literalValue("foo")}`',
    output: { sql: "SELECT 'foo'" },
  },
  {
    name: "sql.literalValue with quotes → escape embedded quotes",
    input: `sql.unsafe\`SELECT \${sql.literalValue("foo'bar")}\``,
    output: { sql: "SELECT 'foo''bar'" },
  },
  {
    name: "sql.literalValue dynamic input → query skipped",
    input: 'const value = "foo"; sql.unsafe`SELECT ${sql.literalValue(value)}`',
    output: { sql: "SELECT /* skipped */" },
  },
  {
    name: "fragment identifier with dynamic segment → query skipped",
    input:
      'const schema = "public"; const from = sql.fragment`FROM ${sql.identifier([schema, "users"])}`; sql.unsafe`SELECT * ${from}`',
    output: { sql: "SELECT * /* skipped */" },
  },
  {
    name: "sql.join → query skipped",
    input: "sql.unsafe`SELECT ${sql.join([1, 2], sql.fragment`, `)}`",
    output: { sql: "SELECT /* skipped */" },
  },
  {
    name: "plain variable (default $N)",
    input: "const x = 42; sql.unsafe`SELECT ${x}`",
    output: { sql: "SELECT $1" },
  },
  {
    name: "multiple translated expressions",
    input: "sql.unsafe`SELECT ${sql.json({ a: 1 })}, ${sql.json({ b: 2 })}`",
    output: { sql: "SELECT $N::json, $N::json" },
  },
];

describe("slonik plugin", () => {
  for (const c of cases) {
    it(c.name, () => {
      // ARRANGE
      const imports =
        c.imports === null ? [] : ['import { sql } from "slonik"', ...(c.imports ?? [])];
      const source = imports.length > 0 ? `${imports.join("; ")}; ${c.input}` : c.input;

      // ACT
      const result = driver.toSQL(source);

      // ASSERT
      if ("skipped" in c.output) {
        expect(result).toEqual({ skipped: true });
      } else if ("sql" in c.output && c.output.sql.includes("/* skipped */")) {
        expect(result).toMatchObject({ sql: expect.stringContaining("/* skipped */") });
      } else {
        expect(result).toEqual(c.output);
      }
    });
  }
});
