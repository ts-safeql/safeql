import { normalizeIndent } from "@ts-safeql/shared";
import { test } from "vitest";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();

test("scalar subquery in select list should infer correct type", async () => {
  await testQuery({
    schema: `
      CREATE TABLE tbl (
        id INTEGER PRIMARY KEY,
        col TEXT
      );
    `,
    query: `SELECT (SELECT col FROM tbl LIMIT 1) AS col`,
    expected: [
      [
        "col",
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

test("scalar subquery from CTE should infer correct type", async () => {
  await testQuery({
    schema: `
      CREATE TABLE users (
        id BIGINT PRIMARY KEY,
        name TEXT NOT NULL
      );
    `,
    query: `
      WITH existing AS (
        SELECT name FROM users LIMIT 1
      )
      SELECT (SELECT name FROM existing) AS user_name
    `,
    expected: [
      [
        "user_name",
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

test("scalar subquery with WHERE should infer non-nullable type", async () => {
  await testQuery({
    schema: `
      CREATE TABLE tbl (
        id INTEGER PRIMARY KEY,
        col TEXT
      );
    `,
    query: `SELECT (SELECT col FROM tbl WHERE col IS NOT NULL LIMIT 1) AS col`,
    expected: [
      [
        "col",
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

test("scalar subquery wrapping count() should be non-nullable", async () => {
  await testQuery({
    query: `SELECT (SELECT COUNT(*)::int FROM member WHERE FALSE) AS count`,
    expected: [["count", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("scalar subquery wrapping count(*) without cast should be non-nullable bigint", async () => {
  await testQuery({
    query: `SELECT (SELECT count(*) FROM member) AS c`,
    expected: [["c", { kind: "type", value: "string", type: "int8" }]],
  });
});

test("scalar subquery wrapping count(distinct x) should be non-nullable", async () => {
  await testQuery({
    query: `SELECT (SELECT count(DISTINCT id)::int FROM member WHERE FALSE) AS c`,
    expected: [["c", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("scalar subquery wrapping count() + 1 should be non-nullable", async () => {
  await testQuery({
    query: `SELECT (SELECT count(*)::int + 1 FROM member WHERE FALSE) AS c`,
    expected: [["c", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("scalar subquery wrapping max() should be nullable", async () => {
  await testQuery({
    query: `SELECT (SELECT max(first_name) FROM member) AS m`,
    expected: [
      [
        "m",
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

test("scalar subquery wrapping sum() should be nullable", async () => {
  await testQuery({
    query: `SELECT (SELECT sum(id) FROM member) AS s`,
    expected: [
      [
        "s",
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

test("scalar subquery wrapping sum() over empty rows should be nullable", async () => {
  await testQuery({
    query: `SELECT (SELECT sum(0) FROM member WHERE FALSE) AS s`,
    expected: [
      [
        "s",
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

test("scalar subquery wrapping array_agg() should be nullable", async () => {
  await testQuery({
    query: `SELECT (SELECT array_agg(id) FROM member) AS ids`,
    expected: [
      [
        "ids",
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

test("scalar subquery with GROUP BY should be nullable even when wrapping count()", async () => {
  await testQuery({
    query: `SELECT (SELECT count(*)::int FROM member GROUP BY id LIMIT 1) AS c`,
    expected: [
      [
        "c",
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

test("scalar subquery with HAVING should be nullable even when wrapping count()", async () => {
  await testQuery({
    query: `SELECT (SELECT count(*)::int FROM member HAVING count(*) > 0) AS c`,
    expected: [
      [
        "c",
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

test("scalar subquery with LIMIT wrapping count() should be non-nullable", async () => {
  await testQuery({
    query: `SELECT (SELECT count(*)::int FROM member LIMIT 1) AS c`,
    expected: [["c", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("scalar subquery with LIMIT 0 wrapping count() should be nullable", async () => {
  await testQuery({
    query: `SELECT (SELECT count(*)::int FROM member LIMIT 0) AS c`,
    expected: [
      [
        "c",
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

test("max() on nullable column should resolve argument type", async () => {
  await testQuery({
    query: `SELECT max(nullable_col) AS m FROM test_nullability`,
    expected: [
      [
        "m",
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

test("scalar subquery with CASE without ELSE should be nullable", async () => {
  await testQuery({
    query: `SELECT (SELECT CASE WHEN false THEN 1 END) AS n`,
    expected: [
      [
        "n",
        {
          kind: "union",
          value: [
            { kind: "literal", value: "1", base: { kind: "type", value: "number", type: "int4" } },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("scalar subquery selecting a column should be nullable", async () => {
  await testQuery({
    query: `SELECT (SELECT id FROM member LIMIT 1) AS id`,
    expected: [
      [
        "id",
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

test("EXISTS subquery should remain non-nullable boolean", async () => {
  await testQuery({
    query: `SELECT EXISTS(SELECT 1 FROM member WHERE FALSE) AS has_any`,
    expected: [["has_any", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("unnamed scalar subquery wrapping count() should be non-nullable", async () => {
  await testQuery({
    query: `SELECT (SELECT count(*) FROM member)`,
    expected: [["count", { kind: "type", value: "string", type: "int8" }]],
  });
});

test("scalar subquery wrapping count(*) OVER () should be nullable", async () => {
  await testQuery({
    query: `SELECT (SELECT count(*) OVER () FROM member) AS c`,
    expected: [
      [
        "c",
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

test("scalar subquery with UNION of counts should be nullable", async () => {
  await testQuery({
    query: normalizeIndent`
      SELECT (
        SELECT count(*)::int FROM member
        UNION
        SELECT count(*)::int FROM member_team
      ) AS c
    `,
    expected: [
      [
        "c",
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

test("scalar subquery wrapping percentile_cont stays nullable on empty input", async () => {
  await testQuery({
    query: normalizeIndent`
      SELECT (
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY id)
        FROM member
      ) AS p
    `,
    expected: [
      [
        "p",
        {
          kind: "union",
          value: [
            { kind: "type", value: "unknown", type: "unknown" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("scalar subquery with count() inside CASE should be non-nullable", async () => {
  await testQuery({
    query: normalizeIndent`
      SELECT (
        SELECT CASE WHEN true THEN count(*)::int ELSE 0 END
        FROM member
        WHERE FALSE
      ) AS c
    `,
    expected: [["c", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("scalar subquery selecting a constant should be non-nullable", async () => {
  await testQuery({
    query: `SELECT (SELECT 1) AS n`,
    expected: [
      [
        "n",
        {
          kind: "literal",
          value: "1",
          base: { kind: "type", value: "number", type: "int4" },
        },
      ],
    ],
  });
});

test("scalar subquery with constant and WHERE false should be nullable", async () => {
  await testQuery({
    query: `SELECT (SELECT 1 WHERE false) AS n`,
    expected: [
      [
        "n",
        {
          kind: "union",
          value: [
            { kind: "literal", value: "1", base: { kind: "type", value: "number", type: "int4" } },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("scalar subquery with constant FROM table WHERE false should be nullable", async () => {
  await testQuery({
    query: `SELECT (SELECT 1 FROM member WHERE false) AS n`,
    expected: [
      [
        "n",
        {
          kind: "union",
          value: [
            { kind: "literal", value: "1", base: { kind: "type", value: "number", type: "int4" } },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("scalar subquery with aggregate in CASE WHEN should be non-nullable", async () => {
  await testQuery({
    query: normalizeIndent`
      SELECT (
        SELECT CASE WHEN count(*) > 0 THEN 1 ELSE 0 END
        FROM member
        WHERE false
      ) AS c
    `,
    expected: [["c", { kind: "type", value: "number", type: "int4" }]],
  });
});
