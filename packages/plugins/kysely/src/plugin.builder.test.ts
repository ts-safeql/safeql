import { afterAll, describe, expect, it } from "vitest";
import { PluginTestDriver, type ToSQLResult } from "@ts-safeql/plugin-utils/testing";
import plugin from "./plugin";

const driver = new PluginTestDriver({
  plugin: plugin.factory({ builder: true }),
  projectDir: process.cwd(),
});

afterAll(() => driver.teardown());

const preamble = `
import { Kysely, sql } from "kysely";
interface DB { person: { id: number; first_name: string; bio: string | null } }
declare const db: Kysely<DB>;
declare const min: number;
declare const col: string;
`;

type Case = { name: string; code: string; output: ToSQLResult };

const validCases: Case[] = [
  {
    name: "embedded raw sql in .select(.as())",
    code: `db.selectFrom("person").select(sql<string>\`upper(first_name)\`.as("shout")).execute()`,
    output: { sql: `select upper(first_name) as "shout" from "person"` },
  },
  {
    name: "embedded raw sql in .where()",
    code: `db.selectFrom("person").select("id").where(sql\`bio is not null\`).execute()`,
    output: { sql: `select "id" from "person" where bio is not null` },
  },
  {
    name: "embedded raw sql alongside a static column",
    code: `db.selectFrom("person").select(["id", sql<string>\`lower(first_name)\`.as("lo")]).execute()`,
    output: { sql: `select "id", lower(first_name) as "lo" from "person"` },
  },
  {
    name: "value interpolation in embedded sql becomes a bound param",
    code: `db.selectFrom("person").select("id").where(sql\`id > \${min}\`).execute()`,
    output: { sql: `select "id" from "person" where id > $1` },
  },
  {
    name: "sql.ref helper in embedded sql is honored",
    code: `db.selectFrom("person").select(sql\`\${sql.ref("first_name")}\`.as("n")).execute()`,
    output: { sql: `select "first_name" as "n" from "person"` },
  },
];

const skipCases: Case[] = [
  {
    name: "pure builder (no embedded raw sql) is left to Kysely's types",
    code: `db.selectFrom("person").select(["id", "first_name"]).execute()`,
    output: { skipped: true },
  },
  {
    name: "dynamic identifier in embedded sql is skipped",
    code: `db.selectFrom("person").select(sql\`\${sql.ref(col)}\`.as("x")).execute()`,
    output: { skipped: true },
  },
  {
    name: "dynamic select callback is skipped",
    code: `db.selectFrom("person").select((eb) => eb.fn.countAll().as("n")).execute()`,
    output: { skipped: true },
  },
];

describe("kysely plugin — builder embedded-sql (valid)", () => {
  for (const c of validCases) {
    it(c.name, () => expect(driver.toBuilderSQL(preamble + c.code)).toEqual(c.output));
  }
});

describe("kysely plugin — builder embedded-sql (skip)", () => {
  for (const c of skipCases) {
    it(c.name, () => expect(driver.toBuilderSQL(preamble + c.code)).toEqual(c.output));
  }
});

const rootCases: { name: string; source: string; output: ToSQLResult }[] = [
  {
    name: "root under a non-conventional name (client) is detected by type",
    source: `
import { Kysely, sql } from "kysely";
interface DB { person: { id: number; first_name: string } }
declare const client: Kysely<DB>;
client.selectFrom("person").select(sql<string>\`upper(first_name)\`.as("x")).execute()`,
    output: { sql: `select upper(first_name) as "x" from "person"` },
  },
  {
    name: "a Kysely method prefix (withSchema) is preserved, not mistaken for the root",
    source: `
import { Kysely, sql } from "kysely";
interface DB { person: { id: number; first_name: string } }
declare const db: Kysely<DB>;
db.withSchema("audit").selectFrom("person").select(sql<string>\`upper(first_name)\`.as("x")).execute()`,
    output: { sql: `select upper(first_name) as "x" from "audit"."person"` },
  },
  {
    name: "an any-typed root is skipped (never false-validated)",
    source: `
import { sql } from "kysely";
declare const db: any;
db.selectFrom("person").select(sql<string>\`upper(first_name)\`.as("x")).execute()`,
    output: { skipped: true },
  },
];

describe("kysely plugin — builder root detection by type", () => {
  for (const c of rootCases) {
    it(c.name, () => expect(driver.toBuilderSQL(c.source)).toEqual(c.output));
  }
});
