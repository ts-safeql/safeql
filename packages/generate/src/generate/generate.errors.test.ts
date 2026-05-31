import { test } from "vitest";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();

test("select with incorrect operation", async () => {
  await testQuery({
    query: `SELECT id FROM member WHERE first_name = 1`,
    expectedError: "operator does not exist: text = integer",
  });
});

test("select where int column = any(array)", async () => {
  await testQuery({
    query: `SELECT id FROM member WHERE id = ANY($1::int[])`,
    expected: [["id", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("select with syntax error", async () => {
  await testQuery({
    query: `SELECT id FROM member WHERE`,
    expectedError: "syntax error at end of input",
  });
});
