import { test } from "vitest";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();

test("select count(1) should be non-nullable", async () => {
  await testQuery({
    query: `SELECT count(1)`,
    expected: [["count", { kind: "type", value: "string", type: "int8" }]],
  });
});

test("select count(1) as col should be non-nullable", async () => {
  await testQuery({
    query: `SELECT count(1) as col`,
    expected: [["col", { kind: "type", value: "string", type: "int8" }]],
  });
});

test("select count(1)::int as col should be non-nullable", async () => {
  await testQuery({
    query: `SELECT count(1)::int as col`,
    expected: [["col", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("SELECT id FROM member tbl WHERE tbl.id IS NOT NULL", async () => {
  await testQuery({
    query: `SELECT id FROM member tbl WHERE tbl.id IS NOT NULL`,
    expected: [["id", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("SELECT tbl.id FROM member tbl WHERE tbl.id IS NOT NULL", async () => {
  await testQuery({
    query: `SELECT tbl.id FROM member tbl WHERE tbl.id IS NOT NULL`,
    expected: [["id", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("select psa.pid from pg_stat_activity psa where psa.pid IS NOT NULL", async () => {
  await testQuery({
    query: `select psa.pid from pg_stat_activity psa where psa.pid IS NOT NULL`,
    expected: [["pid", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("select sum", async () => {
  await testQuery({
    query: `SELECT sum(id) from member`,
    expected: [
      [
        "sum",
        {
          kind: "union",
          value: [
            { kind: "type", value: "string", type: "int8" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select sum(col)::int should still be number | null", async () => {
  await testQuery({
    query: `SELECT sum(id)::int from member where false`,
    expected: [
      [
        "sum",
        {
          kind: "union",
          value: [
            { kind: "type", value: "number", type: "int4" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select nullable column with nullabilty check", async () => {
  await testQuery({
    query: `
    SELECT nullable_col FROM test_nullability WHERE nullable_col IS NOT NULL
    `,
    expected: [["nullable_col", { kind: "type", value: "string", type: "text" }]],
  });
});

test("nullable columns in regular subselect should remain nullable", async () => {
  await testQuery({
    schema: `
      CREATE TABLE test_table (
        id INTEGER PRIMARY KEY,
        nullable_text TEXT,
        non_null_text TEXT NOT NULL
      );
    `,
    query: `
      SELECT nullable_text, non_null_text
      FROM (SELECT nullable_text, non_null_text FROM test_table) sub
    `,
    expected: [
      [
        "nullable_text",
        {
          kind: "union",
          value: [
            { kind: "type", value: "string", type: "text" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
      ["non_null_text", { kind: "type", value: "string", type: "text" }],
    ],
  });
});

test("nullable columns in INNER JOIN subselect should remain nullable", async () => {
  await testQuery({
    schema: `
      CREATE TABLE table_a (id INTEGER PRIMARY KEY);
      CREATE TABLE table_b (
        id INTEGER PRIMARY KEY,
        nullable_col TEXT
      );
    `,
    query: `
      SELECT sub.nullable_col
      FROM table_a
      INNER JOIN (SELECT id, nullable_col FROM table_b) sub ON sub.id = table_a.id
    `,
    expected: [
      [
        "nullable_col",
        {
          kind: "union",
          value: [
            { kind: "type", value: "string", type: "text" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("regression: wrong inference of nullable in aggregation", async () => {
  await testQuery({
    query: `
      with subquery as (
        select a_id, array_agg(b_id) as list
        from b
        group by a_id
      )
      select subquery.list
      from a
      left join subquery on (subquery.a_id = a.id);
    `,
    schema: `
      CREATE TABLE a (
        id int primary key,
        name text not null default ''
      );
 
      CREATE TABLE b (
        a_id int not null,
        b_id int not null,
        primary key (a_id, b_id)
      );
    `,
    expected: [
      [
        "list",
        {
          kind: "union",
          value: [
            { kind: "array", value: { kind: "type", value: "number", type: "int4" } },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});
