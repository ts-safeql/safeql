import { createPool, sql } from "slonik";
import { createPgDriverFactory } from "@slonik/pg-driver";
import { z } from "zod";

const pool = await createPool("postgres://", { driverFactory: createPgDriverFactory() });

section("sql.type — Zod schema validates result", () => {
  // inline schema
  pool.one(sql.type(z.object({ id: z.number(), version: z.string() }))`
    SELECT oid::int4 AS id, typname::text AS version FROM pg_type LIMIT 1
  `);

  // referenced schema variable
  const TypeRow = z.object({ id: z.number(), version: z.string() });
  pool.one(sql.type(TypeRow)`
    SELECT oid::int4 AS id, typname::text AS version FROM pg_type LIMIT 1
  `);

  // nullable column
  pool.one(sql.type(z.object({ v: z.string().nullable() }))`SELECT NULL::text AS v`);

  // multiple columns with mixed types
  pool.one(sql.type(z.object({ n: z.number(), s: z.string(), b: z.boolean() }))`
    SELECT 1::int4 AS n, 'hello'::text AS s, true AS b
  `);
});

section("sql.typeAlias — alias→schema is runtime-only", () => {
  // validates SQL but skips type annotations
  pool.query(sql.typeAlias("id")`SELECT 1 AS id`);
});

section("sql.unsafe — opt-out of type checking", () => {
  // no type annotation needed
  pool.query(sql.unsafe`SELECT 1`);
});

section("sql.identifier", () => {
  // single name
  pool.query(sql.unsafe`SELECT typname::text FROM ${sql.identifier(["pg_type"])} LIMIT 1`);

  // schema-qualified
  pool.one(sql.type(z.object({ oid: z.number() }))`
    SELECT oid::int4 AS oid FROM ${sql.identifier(["pg_catalog", "pg_type"])} LIMIT 1
  `);
});

section("sql.json / sql.jsonb", () => {
  // sql.json
  pool.one(sql.type(z.object({ p: z.string().nullable() }))`
    SELECT ${sql.json({ id: 1 })}::jsonb ->> 'id' AS p
  `);

  // sql.jsonb
  pool.one(sql.type(z.object({ p: z.string().nullable() }))`
    SELECT ${sql.jsonb([1, 2, 3])}::jsonb ->> 0 AS p
  `);
});

section("sql.binary", () => {
  // bytea parameter
  pool.query(sql.unsafe`SELECT ${sql.binary(Buffer.from("foo"))}`);
});

section("sql.date / sql.timestamp / sql.interval", () => {
  // sql.date
  pool.one(sql.type(z.object({ d: z.string().nullable() }))`
    SELECT ${sql.date(new Date("2022-08-19T03:27:24.951Z"))}::text AS d
  `);

  // sql.timestamp
  pool.one(sql.type(z.object({ d: z.string().nullable() }))`
    SELECT ${sql.timestamp(new Date("2022-08-19T03:27:24.951Z"))}::text AS d
  `);

  // sql.interval
  pool.one(sql.type(z.object({ i: z.string().nullable() }))`
    SELECT ${sql.interval({ days: 3 })}::text AS i
  `);
});

section("sql.uuid", () => {
  // uuid parameter
  pool.one(sql.type(z.object({ u: z.string().nullable() }))`
    SELECT ${sql.uuid("00000000-0000-0000-0000-000000000000")}::text AS u
  `);
});

section("sql.array", () => {
  // typed array
  pool.one(sql.type(z.object({ a: z.number().nullable() }))`
    SELECT ${sql.array([1, 2, 3], "int4")} AS a
  `);

  // ANY() pattern from README
  pool.query(sql.typeAlias("id")`
    SELECT oid::int4 AS id FROM pg_type
    WHERE oid = ANY(${sql.array([1, 2, 3], "int4")})
  `);
});

section("sql.join — too dynamic, query skipped", () => {
  // comma-separated values
  pool.query(sql.unsafe`SELECT ${sql.join([1, 2, 3], sql.fragment`, `)}`);

  // boolean expressions
  pool.query(sql.unsafe`SELECT ${sql.join([1, 2], sql.fragment` AND `)}`);

  // tuple list
  pool.query(sql.unsafe`
    SELECT ${sql.join(
      [
        sql.fragment`(${sql.join([1, 2], sql.fragment`, `)})`,
        sql.fragment`(${sql.join([3, 4], sql.fragment`, `)})`,
      ],
      sql.fragment`, `,
    )}
  `);
});

section("sql.unnest — too dynamic, query skipped", () => {
  // bulk insert with string type names
  pool.query(sql.unsafe`
    SELECT bar, baz
    FROM ${sql.unnest(
      [
        [1, "foo"],
        [2, "bar"],
      ],
      ["int4", "text"],
    )} AS foo(bar, baz)
  `);
});

section("sql.literalValue — too dynamic, query skipped", () => {
  // raw literal interpolation
  pool.query(sql.unsafe`SELECT ${sql.literalValue("foo")}`);
});

section("sql.fragment — composable pieces", () => {
  // standalone fragment (not linted)
  sql.fragment`WHERE 1 = 1`;

  // fragment as expression (query skipped)
  const whereFragment = sql.fragment`WHERE typname = ${"bool"}`;
  pool.query(sql.unsafe`SELECT typname FROM pg_type ${whereFragment}`);

  // nested fragments
  const nestedCondition = sql.fragment`typname = ${"bool"}`;
  const nestedWhereFragment = sql.fragment`WHERE ${nestedCondition}`;
  pool.query(sql.unsafe`SELECT typname FROM pg_type ${nestedWhereFragment}`);
});

section("value placeholders — plain variables", () => {
  // plain value becomes $N parameter
  const name = "bool";
  pool.query(sql.unsafe`SELECT typname FROM pg_type WHERE typname = ${name}`);
});

section("invalid cases SafeQL catches", () => {
  // bad column
  // eslint-disable-next-line @ts-safeql/check-sql -- column "nonexistent" does not exist
  pool.query(sql.unsafe`SELECT nonexistent FROM pg_type`);

  // bad table
  // eslint-disable-next-line @ts-safeql/check-sql -- relation "nonexistent" does not exist
  pool.query(sql.type(z.object({}))`SELECT 1 FROM nonexistent`);

  // wrong zod schema
  // eslint-disable-next-line @ts-safeql/check-sql -- Expected: z.object({ id: z.number() })
  pool.one(sql.type(z.object({ id: z.string() }))`SELECT 1::int4 AS id`);
});

function section(_: string, fn: () => void) {
  fn();
}
