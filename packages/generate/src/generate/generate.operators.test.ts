import { test } from "vitest";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();

test("1 + 2 => number", async () => {
  await testQuery({
    query: `SELECT 1 + 2`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("1 - 2 => number", async () => {
  await testQuery({
    query: `SELECT 1 - 2`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("2 * 3 => number", async () => {
  await testQuery({
    query: `SELECT 2 * 3`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("4 / 2 => number", async () => {
  await testQuery({
    query: `SELECT 4 / 2`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("5 % 2 => number", async () => {
  await testQuery({
    query: `SELECT 5 % 2`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("count(1) + count(1) => string", async () => {
  await testQuery({
    query: `SELECT count(1) + count(1)`,
    expected: [["?column?", { kind: "type", value: "string", type: "int8" }]],
  });
});

test("1 = 1 => boolean", async () => {
  await testQuery({
    query: `SELECT 1 = 1`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("1 != 2 => boolean", async () => {
  await testQuery({
    query: `SELECT 1 != 2`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("1 <> 2 => boolean", async () => {
  await testQuery({
    query: `SELECT 1 <> 2`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("1 < 2 => boolean", async () => {
  await testQuery({
    query: `SELECT 1 < 2`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("1 <= 2 => boolean", async () => {
  await testQuery({
    query: `SELECT 1 <= 2`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("1 > 2 => boolean", async () => {
  await testQuery({
    query: `SELECT 1 > 2`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("1 >= 2 => boolean", async () => {
  await testQuery({
    query: `SELECT 1 >= 2`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'foo' || 'bar' => string", async () => {
  await testQuery({
    query: `SELECT 'foo' || 'bar'`,
    expected: [["?column?", { kind: "type", value: "string", type: "text" }]],
  });
});

test("'foo' LIKE 'f%' => boolean", async () => {
  await testQuery({
    query: `SELECT 'foo' LIKE 'f%'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'foo' NOT LIKE 'f%' => boolean", async () => {
  await testQuery({
    query: `SELECT 'foo' NOT LIKE 'f%'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'foo' ILIKE 'F%' => boolean", async () => {
  await testQuery({
    query: `SELECT 'foo' ILIKE 'F%'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'foo' NOT ILIKE 'F%' => boolean", async () => {
  await testQuery({
    query: `SELECT 'foo' NOT ILIKE 'F%'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'foo' SIMILAR TO 'f.*' => boolean", async () => {
  await testQuery({
    query: `SELECT 'foo' SIMILAR TO 'f.*'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'foo' NOT SIMILAR TO 'f.*' => boolean", async () => {
  await testQuery({
    query: `SELECT 'foo' NOT SIMILAR TO 'f.*'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'foo' IS DISTINCT FROM 'bar' => boolean", async () => {
  await testQuery({
    query: `SELECT 'foo' IS DISTINCT FROM 'bar'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'foo' IS NOT DISTINCT FROM 'bar' => boolean", async () => {
  await testQuery({
    query: `SELECT 'foo' IS NOT DISTINCT FROM 'bar'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("true AND false => boolean", async () => {
  await testQuery({
    query: `SELECT true AND false`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("true OR false => boolean", async () => {
  await testQuery({
    query: `SELECT true OR false`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("5 & 3 => number", async () => {
  await testQuery({
    query: `SELECT 5 & 3`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("5 | 3 => number", async () => {
  await testQuery({
    query: `SELECT 5 | 3`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("5 # 3 => number (bitwise XOR)", async () => {
  await testQuery({
    query: `SELECT 5 # 3`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("1 << 2 => number (bitwise shift left)", async () => {
  await testQuery({
    query: `SELECT 1 << 2`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("4 >> 1 => number (bitwise shift right)", async () => {
  await testQuery({
    query: `SELECT 4 >> 1`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("~int => number", async () => {
  await testQuery({
    query: `SELECT ~5`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("ARRAY[1, 2, 3] && ARRAY[3, 4, 5] => boolean", async () => {
  await testQuery({
    query: `SELECT ARRAY[1, 2, 3] && ARRAY[3, 4, 5]`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("ARRAY[1, 2, 3] @> ARRAY[2, 3] => boolean", async () => {
  await testQuery({
    query: `SELECT ARRAY[1, 2, 3] @> ARRAY[2, 3]`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("ARRAY[2, 3] <@ ARRAY[1, 2, 3] => boolean", async () => {
  await testQuery({
    query: `SELECT ARRAY[2, 3] <@ ARRAY[1, 2, 3]`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("ARRAY[1, 2] || ARRAY[3, 4] => array", async () => {
  await testQuery({
    query: `SELECT ARRAY[1, 2] || ARRAY[3, 4]`,
    expected: [
      ["?column?", { kind: "array", value: { kind: "type", type: "int4", value: "number" } }],
    ],
  });
});

test(`'{"key": "value"}'::jsonb ? 'key' => boolean`, async () => {
  await testQuery({
    query: `SELECT '{"key": "value"}'::jsonb ? 'key'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test(`'{"a": 1, "b": 2}'::jsonb ?| array['a', 'c'] => boolean`, async () => {
  await testQuery({
    query: `SELECT '{"a": 1, "b": 2}'::jsonb ?| array['a', 'c']`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test(`'{"a": 1, "b": 2}'::jsonb ?& array['a', 'b'] => boolean`, async () => {
  await testQuery({
    query: `SELECT '{"a": 1, "b": 2}'::jsonb ?& array['a', 'b']`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test(`'{"a": {"b": 1}}'::jsonb -> 'a' => jsonb`, async () => {
  await testQuery({
    query: `SELECT '{"a": {"b": 1}}'::jsonb -> 'a'`,
    expected: [["?column?", { kind: "type", type: "jsonb", value: "any" }]],
  });
});

test(`'{"a": {"b": 1}}'::jsonb ->> 'a' => string`, async () => {
  await testQuery({
    query: `SELECT '{"a": {"b": 1}}'::jsonb ->> 'a'`,
    expected: [["?column?", { kind: "type", value: "string", type: "text" }]],
  });
});

test(`'{"a": {"b": 1}}'::jsonb #>> '{a,b}' => string`, async () => {
  await testQuery({
    query: `SELECT '{"a": {"b": 1}}'::jsonb #>> '{a,b}'`,
    expected: [["?column?", { kind: "type", value: "string", type: "text" }]],
  });
});

test(`jsonb subselect ->> key => string | null`, async () => {
  await testQuery({
    query: `SELECT (SELECT data FROM employee LIMIT 1) ->> 'myKey' as extracted_value`,
    expected: [
      [
        "extracted_value",
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

test(`jsonb_build_object with column ->> key => string | null`, async () => {
  await testQuery({
    query: `SELECT jsonb_build_object('name', member.last_name) ->> 'name' as extracted_value FROM member`,
    expected: [
      [
        "extracted_value",
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

test(`jsonb_build_object without column ->> key => string`, async () => {
  await testQuery({
    query: `SELECT jsonb_build_object('name', 'value') ->> 'name'`,
    expected: [["?column?", { kind: "type", value: "string", type: "text" }]],
  });
});

test(`'{"a": 1, "b": 2}'::jsonb #- '{a}' => jsonb`, async () => {
  await testQuery({
    query: `SELECT '{"a": 1, "b": 2}'::jsonb #- '{a}'`,
    expected: [["?column?", { kind: "type", value: "any", type: "jsonb" }]],
  });
});

test("|/ 16 => number", async () => {
  await testQuery({
    query: `SELECT |/ 16`,
    expected: [["?column?", { kind: "type", value: "number", type: "float8" }]],
  });
});

test("||/ 27 => number", async () => {
  await testQuery({
    query: `SELECT ||/ 27`,
    expected: [["?column?", { kind: "type", value: "number", type: "float8" }]],
  });
});

test("|/ of a nullable column is nullable", async () => {
  await testQuery({
    schema: `CREATE TABLE test_sqrt (n DOUBLE PRECISION);`,
    query: `SELECT |/ n FROM test_sqrt`,
    expected: [
      [
        "?column?",
        {
          kind: "union",
          value: [
            { kind: "type", value: "number", type: "float8" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("2 ^ 3 => number", async () => {
  await testQuery({
    query: `SELECT 2 ^ 3`,
    expected: [["?column?", { kind: "type", value: "number", type: "float8" }]],
  });
});

test("varchar not like expr", async () => {
  await testQuery({
    schema: `CREATE TABLE tbl (email varchar(80) NOT NULL)`,
    query: `SELECT jsonb_build_object('key', tbl.email NOT LIKE '%@example.com') AS col FROM tbl`,
    expected: [
      [
        "col",
        {
          kind: "object",
          value: [["key", { kind: "type", type: "bool", value: "boolean" }]],
        },
      ],
    ],
  });
});

test("jsonb ->> operator should return string | null", async () => {
  await testQuery({
    query: `SELECT data->>'myKey' as extracted_value FROM employee`,
    expected: [
      [
        "extracted_value",
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
