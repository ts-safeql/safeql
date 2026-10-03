import { test } from "vitest";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();

test("select case when expr with returned string literals", async () => {
  await testQuery({
    query: `
      SELECT
        CASE
          WHEN id = 1 THEN 'one'
          WHEN id = 2 THEN 'two'
          ELSE 'other'
        END as name
      FROM member
    `,
    expected: [
      [
        "name",
        {
          kind: "union",
          value: [
            {
              kind: "literal",
              value: "'one'",
              base: { kind: "type", value: "string", type: "text" },
            },
            {
              kind: "literal",
              value: "'two'",
              base: { kind: "type", value: "string", type: "text" },
            },
            {
              kind: "literal",
              value: "'other'",
              base: { kind: "type", value: "string", type: "text" },
            },
          ],
        },
      ],
    ],
  });

  await testQuery({
    query: `
      SELECT
        CASE
          WHEN id = 1 THEN 'one'
          WHEN id = 2 THEN 'two'
          ELSE NULL
        END as name
      FROM member
      WHERE id = 1
    `,
    expected: [
      [
        "name",
        {
          kind: "union",
          value: [
            {
              kind: "literal",
              value: "'one'",
              base: { kind: "type", value: "string", type: "text" },
            },
            {
              kind: "literal",
              value: "'two'",
              base: { kind: "type", value: "string", type: "text" },
            },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });

  await testQuery({
    query: `
      SELECT
        CASE
          WHEN id = 1 THEN 'one'
          WHEN id = 2 THEN 'two'
        END as name
      FROM member
      WHERE id = 1
    `,
    expected: [
      [
        "name",
        {
          kind: "union",
          value: [
            {
              kind: "literal",
              value: "'one'",
              base: { kind: "type", value: "string", type: "text" },
            },
            {
              kind: "literal",
              value: "'two'",
              base: { kind: "type", value: "string", type: "text" },
            },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });

  await testQuery({
    query: `SELECT CASE WHEN 1 = 1 THEN true ELSE false END`,
    expected: [["case", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("select case when expr is not null else is not null", async () => {
  await testQuery({
    query: `
      SELECT
        CASE WHEN TRUE
          THEN member.id IS NOT NULL
          ELSE member.id IS NOT NULL
        END
      FROM member`,
    expected: [["case", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("select nullable boolean case expression", async () => {
  await testQuery({
    query: `
      SELECT
        CASE
          WHEN TRUE THEN records.value = 1
          ELSE NULL
        END AS result
      FROM
        (VALUES (1)) AS records (value)
    `,
    expected: [
      [
        "result",
        {
          kind: "union",
          value: [
            { kind: "type", value: "boolean", type: "bool" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select count(1) + count(1)", async () => {
  await testQuery({
    query: `SELECT count(1) + count(1)`,
    expected: [["?column?", { kind: "type", value: "string", type: "int8" }]],
  });
});

test("select count(1) + 1", async () => {
  await testQuery({
    query: `SELECT count(1) + 1`,
    expected: [["?column?", { kind: "type", value: "string", type: "int8" }]],
  });
});

test("select case when with jsonb_build_object", async () => {
  await testQuery({
    query: `
      SELECT
        CASE
          WHEN member.id IS NOT NULL THEN (
            jsonb_build_object(
              'is_test',
              member.first_name NOT LIKE '%test%'
            )
          )
          ELSE NULL
        END AS col
      FROM
        member`,
    expected: [
      [
        "col",
        {
          kind: "union",
          value: [
            {
              kind: "object",
              value: [["is_test", { kind: "type", value: "boolean", type: "bool" }]],
            },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select case when with jsonb_build_object and left join", async () => {
  await testQuery({
    query: `
      SELECT
        CASE WHEN member.id IS NOT NULL
        THEN jsonb_build_object('is_test', phonenumber.email NOT LIKE '%212718%')
        ELSE NULL
      END AS col
      FROM member
        JOIN member_email phonenumber ON member.id = phonenumber.member_id
    `,
    expected: [
      [
        "col",
        {
          kind: "union",
          value: [
            {
              kind: "object",
              value: [["is_test", { kind: "type", type: "bool", value: "boolean" }]],
            },
            { kind: "type", type: "null", value: "null" },
          ],
        },
      ],
    ],
  });
});
