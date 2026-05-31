import { test } from "vitest";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();

test("(init generate cache)", async () => {
  await testQuery({
    query: `SELECT 1 as x`,
    expected: [
      ["x", { kind: "literal", value: "1", base: { kind: "type", value: "number", type: "int4" } }],
    ],
  });
});

test("select columns", async () => {
  await testQuery({
    query: `SELECT id, first_name, last_name from member LIMIT 1`,
    expected: [
      ["id", { kind: "type", value: "number", type: "int4" }],
      ["first_name", { kind: "type", value: "string", type: "text" }],
      ["last_name", { kind: "type", value: "string", type: "text" }],
    ],
  });
});

test("select all_types", async () => {
  await testQuery({
    query: `SELECT * FROM all_types`,
    expected: [
      ["id", { kind: "type", value: "number", type: "int4" }],
      ["text_column", { kind: "type", value: "string", type: "text" }],
      ["varchar_column", { kind: "type", value: "string", type: "varchar" }],
      ["char_column", { kind: "type", value: "string", type: "bpchar" }],
      ["int_column", { kind: "type", value: "number", type: "int4" }],
      ["smallint_column", { kind: "type", value: "number", type: "int2" }],
      ["bigint_column", { kind: "type", value: "string", type: "int8" }],
      ["decimal_column", { kind: "type", value: "string", type: "numeric" }],
      ["numeric_column", { kind: "type", value: "string", type: "numeric" }],
      ["real_column", { kind: "type", value: "number", type: "float4" }],
      ["double_column", { kind: "type", value: "number", type: "float8" }],
      ["serial_column", { kind: "type", value: "number", type: "int4" }],
      ["bigserial_column", { kind: "type", value: "string", type: "int8" }],
      ["boolean_column", { kind: "type", value: "boolean", type: "bool" }],
      ["date_column", { kind: "type", value: "Date", type: "date" }],
      ["time_column", { kind: "type", value: "string", type: "time" }],
      ["time_with_timezone_column", { kind: "type", value: "string", type: "timetz" }],
      ["timestamp_column", { kind: "type", value: "Date", type: "timestamp" }],
      ["timestamp_with_timezone_column", { kind: "type", value: "Date", type: "timestamptz" }],
      ["interval_column", { kind: "type", value: "string", type: "interval" }],
      ["uuid_column", { kind: "type", value: "string", type: "uuid" }],
      ["json_column", { kind: "type", value: "any", type: "json" }],
      ["jsonb_column", { kind: "type", value: "any", type: "jsonb" }],
      [
        "array_text_column",
        { kind: "array", value: { kind: "type", value: "string", type: "_text" } },
      ],
      [
        "array_int_column",
        { kind: "array", value: { kind: "type", value: "number", type: "_int4" } },
      ],
      ["bytea_column", { kind: "type", value: "any", type: "bytea" }],
      ["inet_column", { kind: "type", value: "string", type: "inet" }],
      ["cidr_column", { kind: "type", value: "string", type: "cidr" }],
      ["macaddr_column", { kind: "type", value: "string", type: "macaddr" }],
      ["macaddr8_column", { kind: "type", value: "string", type: "macaddr8" }],
      ["tsvector_column", { kind: "type", value: "unknown", type: "tsvector" }],
      ["tsquery_column", { kind: "type", value: "unknown", type: "tsquery" }],
      ["xml_column", { kind: "type", value: "unknown", type: "xml" }],
      ["point_column", { kind: "type", value: "unknown", type: "point" }],
      ["line_column", { kind: "type", value: "unknown", type: "line" }],
      ["lseg_column", { kind: "type", value: "unknown", type: "lseg" }],
      ["box_column", { kind: "type", value: "unknown", type: "box" }],
      ["path_column", { kind: "type", value: "unknown", type: "path" }],
      ["polygon_column", { kind: "type", value: "unknown", type: "polygon" }],
      ["circle_column", { kind: "type", value: "unknown", type: "circle" }],
      ["money_column", { kind: "type", value: "number", type: "money" }],
      ["bit_column", { kind: "type", value: "boolean", type: "bit" }],
      ["bit_varying_column", { kind: "type", value: "unknown", type: "varbit" }],
    ],
  });
});

test("select 0", async () => {
  await testQuery({
    query: `SELECT 0`,
    expected: [
      [
        "?column?",
        { kind: "literal", value: "0", base: { kind: "type", value: "number", type: "int4" } },
      ],
    ],
  });
});

test("camel case field transform", async () => {
  await testQuery({
    options: { fieldTransform: "camel" },
    query: `SELECT id, first_name, last_name from member LIMIT 1`,
    expected: [
      ["id", { kind: "type", value: "number", type: "int4" }],
      ["firstName", { kind: "type", value: "string", type: "text" }],
      ["lastName", { kind: "type", value: "string", type: "text" }],
    ],
  });
});

test("select true", async () => {
  await testQuery({
    options: { fieldTransform: "camel" },
    query: `SELECT true`,
    expected: [
      [
        "?column?",
        { kind: "literal", value: "true", base: { kind: "type", value: "boolean", type: "bool" } },
      ],
    ],
  });
});

test("select column as camelCase", async () => {
  await testQuery({
    query: `SELECT first_name as "firstName" from member LIMIT 1`,
    expected: [["firstName", { kind: "type", value: "string", type: "text" }]],
  });
});

test("select non-table column", async () =>
  await testQuery({
    query: `SELECT 1 as count`,
    expected: [
      [
        "count",
        { kind: "literal", value: "1", base: { kind: "type", value: "number", type: "int4" } },
      ],
    ],
  }));

test("select now()", async () => {
  await testQuery({
    query: `SELECT now()`,
    expected: [["now", { kind: "type", value: "Date", type: "timestamptz" }]],
  });
});
