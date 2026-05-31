import { test } from "vitest";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();

test("select union select #1", async () => {
  await testQuery({
    query: `SELECT 1 UNION SELECT 2`,
    expected: [
      [
        "?column?",
        {
          kind: "union",
          value: [
            { kind: "literal", value: "1", base: { kind: "type", value: "number", type: "int4" } },
            { kind: "literal", value: "2", base: { kind: "type", value: "number", type: "int4" } },
          ],
        },
      ],
    ],
  });
});

test("select union select #2", async () => {
  await testQuery({
    query: `SELECT 1 as a UNION SELECT 2 as b`,
    expected: [
      [
        "a",
        {
          kind: "union",
          value: [
            { kind: "literal", value: "1", base: { kind: "type", value: "number", type: "int4" } },
            { kind: "literal", value: "2", base: { kind: "type", value: "number", type: "int4" } },
          ],
        },
      ],
    ],
  });
});

test("select union select #3", async () => {
  await testQuery({
    query: `SELECT 'Hello' UNION SELECT 7;`,
    expectedError: 'invalid input syntax for type integer: "Hello"',
  });
});

test("select union select #4", async () => {
  await testQuery({
    query: `SELECT 1 as a, 'b' as b UNION SELECT 2 as x, null as y`,
    expected: [
      [
        "a",
        {
          kind: "union",
          value: [
            { kind: "literal", value: "1", base: { kind: "type", value: "number", type: "int4" } },
            { kind: "literal", value: "2", base: { kind: "type", value: "number", type: "int4" } },
          ],
        },
      ],
      [
        "b",
        {
          kind: "union",
          value: [
            {
              kind: "literal",
              value: "'b'",
              base: { kind: "type", value: "string", type: "text" },
            },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});
