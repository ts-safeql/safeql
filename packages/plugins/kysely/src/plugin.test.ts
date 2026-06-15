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

const imp = (code: string) =>
  `import { sql, Kysely } from "kysely"; declare const db: Kysely<any>; ${code}`;

const targetCases: Case[] = [
  {
    name: "bare sql tag is validated",
    source: imp("sql`select 1`"),
    output: { sql: "select 1" },
  },
  {
    name: "typed sql tag is validated",
    source: imp("sql<{ id: number }>`select 1 as id`"),
    output: { sql: "select 1 as id" },
  },
  {
    name: "executed sql tag is validated",
    source: imp("sql`select 1`.execute(db)"),
    output: { sql: "select 1" },
  },
  {
    name: "compiled sql tag is validated",
    source: imp("sql`select 1`.compile(db)"),
    output: { sql: "select 1" },
  },
  {
    name: "a sql tag NOT imported from kysely is ignored",
    source: "const sql = (s: TemplateStringsArray) => s; sql`select 1`",
    output: { skipped: true },
  },
  {
    name: ".as() selection fragment is skipped",
    source: imp("db.selectFrom('person').select(sql<string>`first_name`.as('n'))"),
    output: { skipped: true },
  },
  {
    name: "sql tag passed as a call argument (builder fragment) is skipped",
    source: imp("declare function take(x: unknown): void; take(sql`now()`)"),
    output: { skipped: true },
  },
  {
    name: "nested fragment inside another sql template is skipped on its own",
    // The inner `sql`x`` is a fragment; only the outer query is validated.
    source: imp("sql`select * from person where ${sql`id = ${1}`}`"),
    output: { sql: "select * from person where id = $N" },
  },
];

const expressionCases: Case[] = [
  {
    name: "plain interpolation -> positional param",
    source: imp("const id = 123; sql`select * from person where id = ${id}`"),
    output: { sql: "select * from person where id = $1" },
  },
  {
    name: "sql.val -> positional param",
    source: imp("sql`select ${sql.val(42)} as answer`"),
    output: { sql: "select $N as answer" },
  },
  {
    name: "sql.ref -> quoted identifier",
    source: imp("sql`select ${sql.ref('first_name')} from person`"),
    output: { sql: 'select "first_name" from person' },
  },
  {
    name: "sql.ref dotted -> qualified quoted identifier",
    source: imp("sql`select ${sql.ref('person.first_name')} from person`"),
    output: { sql: 'select "person"."first_name" from person' },
  },
  {
    name: "sql.ref with resolvable const -> quoted identifier",
    source: imp("const col = 'first_name'; sql`select ${sql.ref(col)} from person`"),
    output: { sql: 'select "first_name" from person' },
  },
  {
    name: "sql.ref with dynamic value -> skip query",
    source: imp("declare const col: string; sql`select ${sql.ref(col)} from person`"),
    output: { sql: "select /* skipped */ from person" },
  },
  {
    name: "sql.id -> dot-joined quoted identifiers",
    source: imp("sql`create index ${sql.id('person', 'name_idx')} on person`"),
    output: { sql: 'create index "person"."name_idx" on person' },
  },
  {
    name: "sql.table -> quoted table",
    source: imp("sql`select name from ${sql.table('person')}`"),
    output: { sql: 'select name from "person"' },
  },
  {
    name: "sql.table schema-qualified -> qualified quoted table",
    source: imp("sql`select name from ${sql.table('public.person')}`"),
    output: { sql: 'select name from "public"."person"' },
  },
  {
    name: "sql.lit string -> embedded literal",
    source: imp("sql`select * from person where status = ${sql.lit('active')}`"),
    output: { sql: "select * from person where status = 'active'" },
  },
  {
    name: "sql.lit number -> embedded literal",
    source: imp("sql`select ${sql.lit(42)}`"),
    output: { sql: "select 42" },
  },
  {
    name: "sql.raw static -> inlined",
    source: imp("sql`select * from person where ${sql.raw('age > 18')}`"),
    output: { sql: "select * from person where age > 18" },
  },
  {
    name: "sql.raw dynamic -> skip query",
    source: imp("declare const cond: string; sql`select * from person where ${sql.raw(cond)}`"),
    output: { sql: "select * from person where /* skipped */" },
  },
  {
    name: "sql.join static array -> expanded params",
    source: imp("sql`select * from person where id in (${sql.join([1, 2, 3])})`"),
    output: { sql: "select * from person where id in ($N, $N, $N)" },
  },
  {
    name: "sql.join with fragment separator",
    source: imp("sql`select ${sql.join(['a', 'b'], sql` AND `)}`"),
    output: { sql: "select $N AND $N" },
  },
  {
    name: "nested sql fragment is spliced in",
    source: imp("const cond = sql`age > ${18}`; sql`select * from person where ${cond}`"),
    output: { sql: "select * from person where age > $N" },
  },
];

describe("kysely plugin — onTarget", () => {
  for (const c of targetCases) {
    it(c.name, () => expect(driver.toSQL(c.source)).toEqual(c.output));
  }
});

describe("kysely plugin — onExpression", () => {
  for (const c of expressionCases) {
    it(c.name, () => expect(driver.toSQL(c.source)).toEqual(c.output));
  }
});
