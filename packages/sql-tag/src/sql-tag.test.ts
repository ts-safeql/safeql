import assert from "assert";
import { test } from "vitest";
import { createTypedSqlTag, sql } from "./sql-tag";

test("sql", () => {
  const query = sql`SELECT * FROM users WHERE first_name = ${"John"}`;

  assert.deepEqual(query.text, "SELECT * FROM users WHERE first_name = $1");
  assert.deepEqual(query.values, ["John"]);
});

test("sql with multiple values", () => {
  const query = sql`SELECT * FROM users WHERE id = ${5} AND first_name = ${"John"}`;

  assert.deepEqual(query.text, "SELECT * FROM users WHERE id = $1 AND first_name = $2");
  assert.deepEqual(query.values, [5, "John"]);
});

test("sql with no values", () => {
  const query = sql`SELECT * FROM users`;

  assert.deepEqual(query.text, "SELECT * FROM users");
  assert.deepEqual(query.values, []);
});

test("sql query and text should be the same", () => {
  const query = sql`SELECT * FROM users WHERE first_name = ${"John"}`;
  const actualQuery = "SELECT * FROM users WHERE first_name = $1";

  assert.deepEqual(query.text, actualQuery);
  assert.deepEqual(query.query, actualQuery);
});

test("createTypedSql with string only", () => {
  const sql = createTypedSqlTag<string>();

  // @ts-expect-error - should not allow number
  sql`SELECT * FROM users WHERE id = ${5}`;

  // @ts-expect-error - should not allow Date
  sql`SELECT * FROM users WHERE created_at < ${new Date()}`;

  const query = sql`SELECT * FROM users WHERE first_name = ${"John"}`;

  assert.deepEqual(query.text, "SELECT * FROM users WHERE first_name = $1");
  assert.deepEqual(query.values, ["John"]);
});

test("createTypedSql", () => {
  const typedSql1 = createTypedSqlTag<number>();

  typedSql1`SELECT * FROM users WHERE id = ${5}`;
  // @ts-expect-error - should allow only number
  typedSql1`SELECT * FROM users WHERE created_at = ${new Date()}`;

  const typedSql2 = createTypedSqlTag<string | number | Date>();

  // @ts-expect-error - boolean is not allowed
  typedSql2`SELECT * FROM users WHERE is_active = ${true}`;

  const query = typedSql2`
    SELECT *
    FROM users
    WHERE TRUE
      AND id = ${5}
      AND created_at = ${new Date("2023-01-01")}
      AND first_name = ${"John"}
  `;

  assert.deepEqual(
    query.text,
    `
    SELECT *
    FROM users
    WHERE TRUE
      AND id = $1
      AND created_at = $2
      AND first_name = $3
  `,
  );
  assert.deepEqual(query.values, [5, new Date("2023-01-01"), "John"]);
});

test("createTypedSql transform", () => {
  const sql = createTypedSqlTag<string | number | boolean | Date>({
    transform: (value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }

      if (value === "foo") {
        return "bar";
      }
    },
  });

  const query = sql`
    SELECT *
    FROM users
    WHERE TRUE
      AND created_at = ${new Date("2023-01-01")}
      AND first_name = ${"foo"}`;

  assert.deepEqual(
    query.text,
    `
    SELECT *
    FROM users
    WHERE TRUE
      AND created_at = $1
      AND first_name = $2`,
  );

  assert.deepEqual(query.values, ["2023-01-01T00:00:00.000Z", "bar"]);
});
