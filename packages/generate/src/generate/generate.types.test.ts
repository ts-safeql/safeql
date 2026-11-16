import { test } from "vitest";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();

test("select overriden enum", async () => {
  await testQuery({
    query: `SELECT * FROM test_overriden_enum`,
    expected: [
      ["col", { kind: "type", value: "OverridenEnum", type: "overriden_enum" }],
      [
        "nullable_col",
        {
          kind: "union",
          value: [
            { kind: "type", value: "OverridenEnum", type: "overriden_enum" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select overriden domain", async () => {
  await testQuery({
    query: `SELECT * FROM test_overriden_domain`,
    expected: [
      ["col", { kind: "type", value: "OverridenDomain", type: "overriden_domain" }],
      [
        "nullable_col",
        {
          kind: "union",
          value: [
            { kind: "type", value: "OverridenDomain", type: "overriden_domain" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select date columns", async () => {
  await testQuery({
    query: `SELECT * FROM test_date_column`,
    expected: [
      ["date_col", { kind: "type", value: "Date", type: "date" }],
      ["date_array", { kind: "array", value: { kind: "type", value: "Date", type: "_date" } }],
      [
        "instant_arr",
        { kind: "array", value: { kind: "type", value: "Date", type: "_timestamptz" } },
      ],
      ["time_arr", { kind: "array", value: { kind: "type", value: "string", type: "_time" } }],
      ["timetz_arr", { kind: "array", value: { kind: "type", value: "string", type: "_timetz" } }],
      [
        "local_date_time_arr",
        { kind: "array", value: { kind: "type", value: "Date", type: "_timestamp" } },
      ],
      [
        "nullable_date_arr",
        {
          kind: "union",
          value: [
            { kind: "array", value: { kind: "type", value: "Date", type: "_date" } },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select enum", async () => {
  await testQuery({
    query: `SELECT role from member_assignment`,
    expected: [
      [
        "role",
        {
          kind: "union",
          value: [
            { kind: "type", value: "'owner'", type: "role" },
            { kind: "type", value: "'admin'", type: "role" },
            { kind: "type", value: "'editor'", type: "role" },
            { kind: "type", value: "'contributor'", type: "role" },
            { kind: "type", value: "'viewer'", type: "role" },
            { kind: "type", value: "'guest'", type: "role" },
          ],
        },
      ],
    ],
  });
});

test("select domain type", async () => {
  await testQuery({
    query: `SELECT email from member_email`,
    expected: [["email", { kind: "type", value: "string", type: "email", base: "text" }]],
  });
});

test("select array of enums", async () => {
  await testQuery({
    schema: `
      CREATE TYPE my_enum AS ENUM ('A', 'B', 'C');
      CREATE TABLE test_array_enum (col my_enum[] NOT NULL);
    `,
    query: `SELECT col FROM test_array_enum`,
    expected: [
      [
        "col",
        {
          kind: "array",
          value: {
            kind: "union",
            value: [
              { kind: "type", value: "'A'", type: "my_enum" },
              { kind: "type", value: "'B'", type: "my_enum" },
              { kind: "type", value: "'C'", type: "my_enum" },
            ],
          },
        },
      ],
    ],
  });
});

test("select enum with quote and backslash", async () => {
  await testQuery({
    schema: `
      CREATE TYPE quoted_enum AS ENUM ('ok', 'it''s', 'a\\b');
      CREATE TABLE test_quoted_enum (col quoted_enum NOT NULL);
    `,
    query: `SELECT col FROM test_quoted_enum`,
    expected: [
      [
        "col",
        {
          kind: "union",
          value: [
            { kind: "type", value: "'ok'", type: "quoted_enum" },
            { kind: "type", value: "'it\\'s'", type: "quoted_enum" },
            { kind: "type", value: "'a\\\\b'", type: "quoted_enum" },
          ],
        },
      ],
    ],
  });
});

test("select string literal with quote and backslash", async () => {
  await testQuery({
    query: `SELECT 'it''s' AS quoted, 'a\\b' AS path`,
    expected: [
      [
        "quoted",
        {
          kind: "literal",
          value: "'it\\'s'",
          base: { kind: "type", value: "string", type: "text" },
        },
      ],
      [
        "path",
        {
          kind: "literal",
          value: "'a\\\\b'",
          base: { kind: "type", value: "string", type: "text" },
        },
      ],
    ],
  });
});

test("select enum with control characters", async () => {
  await testQuery({
    schema: `
      CREATE TYPE control_enum AS ENUM (E'line\\nbreak', E'tab\\tchar', E'carriage\\rreturn');
      CREATE TABLE test_control_enum (col control_enum NOT NULL);
    `,
    query: `SELECT col FROM test_control_enum`,
    expected: [
      [
        "col",
        {
          kind: "union",
          value: [
            { kind: "type", value: "'line\\nbreak'", type: "control_enum" },
            { kind: "type", value: "'tab\\tchar'", type: "control_enum" },
            { kind: "type", value: "'carriage\\rreturn'", type: "control_enum" },
          ],
        },
      ],
    ],
  });
});
