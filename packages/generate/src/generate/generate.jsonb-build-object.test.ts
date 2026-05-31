import { normalizeIndent } from "@ts-safeql/shared";
import { test } from "vitest";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();

test("invalid: select jsonb_build_object(const)", async () => {
  await testQuery({
    query: `SELECT jsonb_build_object('key') as col`,
    expectedError: normalizeIndent`
      Internal error: argument list must have even number of elements
      Hint: The arguments of jsonb_build_object() must consist of alternating keys and values.
    `,
  });
});

test("select jsonb_build_object(const, const)", async () => {
  await testQuery({
    query: `SELECT jsonb_build_object('key', 'value')`,
    expected: [
      [
        "jsonb_build_object",
        {
          kind: "object",
          value: [
            [
              "key",
              {
                kind: "literal",
                value: "'value'",
                base: { kind: "type", value: "string", type: "text" },
              },
            ],
          ],
        },
      ],
    ],
  });
});

test("select jsonb_build_object(deeply nested)", async () => {
  await testQuery({
    query: `SELECT jsonb_build_object('deeply', jsonb_build_object('nested', 'object'))`,
    expected: [
      [
        "jsonb_build_object",
        {
          kind: "object",
          value: [
            [
              "deeply",
              {
                kind: "object",
                value: [
                  [
                    "nested",
                    {
                      kind: "literal",
                      value: "'object'",
                      base: { kind: "type", value: "string", type: "text" },
                    },
                  ],
                ],
              },
            ],
          ],
        },
      ],
    ],
  });
});

test("select jsonb_build_object(const, columnref)", async () => {
  await testQuery({
    query: `SELECT json_build_object('id', team.id) FROM team`,
    expected: [
      [
        "json_build_object",
        { kind: "object", value: [["id", { kind: "type", value: "number", type: "int4" }]] },
      ],
    ],
  });
});

test("select jsonb_build_object(const, columnref::text)", async () => {
  await testQuery({
    query: `SELECT json_build_object('id', team.id::text) FROM team`,
    expected: [
      [
        "json_build_object",
        { kind: "object", value: [["id", { kind: "type", value: "string", type: "text" }]] },
      ],
    ],
  });
});

test("select jsonb_build_object(const, const::text::int)", async () => {
  await testQuery({
    query: `SELECT json_build_object('id', 1::text::int)`,
    expected: [
      [
        "json_build_object",
        { kind: "object", value: [["id", { kind: "type", value: "number", type: "int4" }]] },
      ],
    ],
  });
});

test("select jsonb_build_object(const, array[int,int,int])", async () => {
  await testQuery({
    query: `SELECT json_build_object('id', array[1,2,3])`,
    expected: [
      [
        "json_build_object",
        {
          kind: "object",
          value: [
            [
              "id",
              {
                kind: "array",
                value: {
                  kind: "union",
                  value: [
                    {
                      kind: "literal",
                      value: "1",
                      base: { kind: "type", value: "number", type: "int4" },
                    },
                    {
                      kind: "literal",
                      value: "2",
                      base: { kind: "type", value: "number", type: "int4" },
                    },
                    {
                      kind: "literal",
                      value: "3",
                      base: { kind: "type", value: "number", type: "int4" },
                    },
                  ],
                },
              },
            ],
          ],
        },
      ],
    ],
  });
});

test("select jsonb_build_object(const, array[int,null])", async () => {
  await testQuery({
    query: `SELECT json_build_object('nullable', array[1,null])`,
    expected: [
      [
        "json_build_object",
        {
          kind: "object",
          value: [
            [
              "nullable",
              {
                kind: "array",
                value: {
                  kind: "union",
                  value: [
                    {
                      kind: "literal",
                      value: "1",
                      base: { kind: "type", value: "number", type: "int4" },
                    },
                    { kind: "type", value: "null", type: "null" },
                  ],
                },
              },
            ],
          ],
        },
      ],
    ],
  });
});
