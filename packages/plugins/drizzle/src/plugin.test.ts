import { afterAll, describe, expect, it } from "vitest";
import { PluginTestDriver, type ToSQLResult } from "@ts-safeql/plugin-utils/testing";
import plugin from "./plugin";

const driver = new PluginTestDriver({
  plugin: plugin.factory({}),
  projectDir: process.cwd(),
});

afterAll(() => driver.teardown());

type Case = { name: string; source: string; output: ToSQLResult };

const imp = (code: string) =>
  `import { sql } from "drizzle-orm"; declare const db: { execute: (q: unknown) => unknown }; ${code}`;

const targetCases: Case[] = [
  {
    name: "standalone sql tag is validated",
    source: imp("sql`select 1`"),
    output: { sql: "select 1" },
  },
  {
    name: "sql tag inside db.execute is validated",
    source: imp("db.execute(sql`select 1`)"),
    output: { sql: "select 1" },
  },
  {
    name: "sql fragment passed to .where is skipped",
    source: imp("declare const qb: { where: (q: unknown) => unknown }; qb.where(sql`id = 1`)"),
    output: { skipped: true },
  },
  {
    name: ".as() selection fragment is skipped",
    source: imp("sql`first_name`.as('n')"),
    output: { skipped: true },
  },
  {
    name: ".mapWith() selection fragment is skipped",
    source: imp("sql`count(*)`.mapWith(Number)"),
    output: { skipped: true },
  },
  {
    name: "a sql tag NOT imported from drizzle is ignored",
    source: "const sql = (s: TemplateStringsArray) => s; sql`select 1`",
    output: { skipped: true },
  },
];

const expressionCases: Case[] = [
  {
    name: "plain primitive interpolation -> positional param",
    source: imp("const id = 123; sql`select * from person where id = ${id}`"),
    output: { sql: "select * from person where id = $1" },
  },
  {
    name: "sql.raw static -> inlined",
    source: imp("sql`select * from person where ${sql.raw('age > 18')}`"),
    output: { sql: "select * from person where age > 18" },
  },
  {
    name: "sql.raw dynamic -> skip",
    source: imp("declare const cond: string; sql`select * from person where ${sql.raw(cond)}`"),
    output: { sql: "select * from person where /* skipped */" },
  },
  {
    name: "sql.identifier -> quoted identifier",
    source: imp("sql`select ${sql.identifier('first_name')} from person`"),
    output: { sql: 'select "first_name" from person' },
  },
  {
    name: "sql.placeholder -> positional param",
    source: imp("sql`select ${sql.placeholder('id')}`"),
    output: { sql: "select $N" },
  },
  {
    name: "non-primitive (object) interpolation -> skip",
    source: imp("sql`select ${{ a: 1 }}`"),
    output: { sql: "select /* skipped */" },
  },
  {
    name: "nested sql fragment is spliced in",
    source: imp("sql`select * from person where ${sql`age > ${18}`}`"),
    output: { sql: "select * from person where age > $N" },
  },
];

describe("drizzle plugin — onTarget", () => {
  for (const c of targetCases) {
    it(c.name, () => expect(driver.toSQL(c.source)).toEqual(c.output));
  }
});

describe("drizzle plugin — onExpression", () => {
  for (const c of expressionCases) {
    it(c.name, () => expect(driver.toSQL(c.source)).toEqual(c.output));
  }
});
