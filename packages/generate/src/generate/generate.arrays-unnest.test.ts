import { normalizeIndent } from "@ts-safeql/shared";
import { test } from "vitest";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();

test("select unnest(array_text_column)", async () => {
  await testQuery({
    query: `SELECT unnest(array_text_column) as unnested_text FROM all_types`,
    expected: [["unnested_text", { kind: "type", value: "string", type: "text" }]],
  });
});

test("select unnest(array_enum_column)", async () => {
  await testQuery({
    schema: `
      CREATE TYPE my_enum AS ENUM ('A', 'B', 'C');
      CREATE TABLE test_unnest_enum (col my_enum[] NOT NULL);
    `,
    query: `SELECT unnest(col) as unnested_enum FROM test_unnest_enum`,
    expected: [
      [
        "unnested_enum",
        {
          kind: "union",
          value: [
            { kind: "type", value: "'A'", type: "my_enum" },
            { kind: "type", value: "'B'", type: "my_enum" },
            { kind: "type", value: "'C'", type: "my_enum" },
          ],
        },
      ],
    ],
  });
});

test("select unnest(multidimensional_array)", async () => {
  await testQuery({
    query: `SELECT unnest(ARRAY[[1,2],[3,4]]) as unnested_int`,
    expected: [
      [
        "unnested_int",
        {
          kind: "union",
          value: [
            { kind: "literal", value: "1", base: { kind: "type", value: "number", type: "int4" } },
            { kind: "literal", value: "2", base: { kind: "type", value: "number", type: "int4" } },
            { kind: "literal", value: "3", base: { kind: "type", value: "number", type: "int4" } },
            { kind: "literal", value: "4", base: { kind: "type", value: "number", type: "int4" } },
          ],
        },
      ],
    ],
  });
});

test("select unnest(nullable_array_column)", async () => {
  await testQuery({
    query: `SELECT unnest(nullable_date_arr) as unnested_date FROM test_date_column`,
    expected: [["unnested_date", { kind: "type", value: "Date", type: "date" }]],
  });
});

test("select unnest(array_with_nulls)", async () => {
  await testQuery({
    query: `SELECT unnest(ARRAY[1, NULL]) as unnested_int`,
    expected: [
      [
        "unnested_int",
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

test("derived table with CROSS JOIN json_array_elements should not throw", async () => {
  await testQuery({
    query: normalizeIndent`
      SELECT code
      FROM (
        SELECT value ->> 'code'::TEXT code
        FROM all_types
        CROSS JOIN json_array_elements(json_column) value
      ) codes
    `,
    expected: [
      [
        "code",
        {
          kind: "union",
          value: [
            { kind: "type", value: "string", type: "text" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
    unknownColumns: ["code"],
  });
});

test("subselect base relation cross joined with subselects should not throw", async () => {
  await testQuery({
    query: normalizeIndent`
      SELECT t.total, u.cnt
      FROM (SELECT count(*)::int AS total FROM member) t
      CROSS JOIN (SELECT count(*)::int AS cnt FROM team) u
      CROSS JOIN (SELECT count(*)::int AS num FROM member_team) s
    `,
    expected: [
      ["total", { kind: "type", value: "number", type: "int4" }],
      ["cnt", { kind: "type", value: "number", type: "int4" }],
    ],
  });
});

test("ARRAY[]::int[] should infer empty integer array", async () => {
  await testQuery({
    query: `SELECT ARRAY[]::int[] AS empty_ints`,
    expected: [
      ["empty_ints", { kind: "array", value: { kind: "type", value: "number", type: "int4" } }],
    ],
  });
});

test("INNER JOIN with set-returning function should not throw", async () => {
  await testQuery({
    query: normalizeIndent`
      SELECT t.id, v.value
      FROM all_types t
      INNER JOIN json_array_elements(t.json_column) AS v ON true
    `,
    expected: [
      ["id", { kind: "type", value: "number", type: "int4" }],
      ["value", { kind: "type", value: "any", type: "json" }],
    ],
    unknownColumns: ["value"],
  });
});
