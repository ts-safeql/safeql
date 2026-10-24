import { test } from "vitest";
import type { ResolvedTarget } from "../generate";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();
const name = { kind: "type", value: "string", type: "name" } as const;
const nullableName: ResolvedTarget = {
  kind: "union",
  value: [name, { kind: "type", value: "null", type: "null" }],
};

test("name casts use the shared string mapping", async () => {
  await testQuery({
    query: "SELECT 'example'::name AS value",
    expected: [["value", name]],
  });
});

test("catalog name columns use the shared string mapping", async () => {
  await testQuery({
    query: "SELECT nspname AS value FROM pg_catalog.pg_namespace",
    expected: [["value", name]],
  });
});

test("catalog name columns remain nullable across outer joins", async () => {
  await testQuery({
    query:
      "SELECT n.nspname AS value FROM member m LEFT JOIN pg_catalog.pg_namespace n ON n.oid = m.id::oid",
    expected: [["value", nullableName]],
  });
});

test("current_schema can return null when no search-path schema exists", async () => {
  await testQuery({
    schema: "SET LOCAL search_path TO nonexistent_name_probe_schema",
    query: "SELECT current_schema() AS value",
    expected: [["value", nullableName]],
  });
});

test("name overrides apply to functions and preserve nullability", async () => {
  await testQuery({
    overrides: { types: { name: "SchemaName" } },
    query: "SELECT current_schema() AS value",
    expected: [
      [
        "value",
        {
          kind: "union",
          value: [
            { kind: "type", value: "SchemaName", type: "name" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});
