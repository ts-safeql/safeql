import { afterAll, describe, expect, it } from "vitest";
import { AnnotatorTestDriver } from "./test-driver";

const driver = new AnnotatorTestDriver();

afterAll(() => driver.teardown());

describe("createZodAnnotator", () => {
  it("ignores tagged templates whose tag is not a call expression", () => {
    // ARRANGE
    const result = driver.run({
      input: "query`SELECT 1`;",
      output: { kind: "type", value: "number" },
    });

    // ASSERT
    expect(result).toBeUndefined();
  });

  it("ignores missing schema arguments at the configured index", () => {
    // ARRANGE
    const result = driver.run({
      input: "query(z.number())`SELECT 1`;",
      output: { kind: "type", value: "number" },
      schemaArgIndex: 1,
    });

    // ASSERT
    expect(result).toBeUndefined();
  });

  it("ignores spread schema arguments", () => {
    // ARRANGE
    const result = driver.run({
      input: `
        const args = [z.number()] as const;
        query(...args)\`SELECT 1\`;
      `,
      output: { kind: "type", value: "number" },
    });

    // ASSERT
    expect(result).toBeUndefined();
  });

  it("ignores values that do not expose _output or _type", () => {
    // ARRANGE
    const result = driver.run({
      input: "query(schema)`SELECT 1`;",
      declarations: ["type NotSchema = { value: string };", "declare const schema: NotSchema;"],
      output: { kind: "type", value: "number" },
    });

    // ASSERT
    expect(result).toBeUndefined();
  });

  it("accepts matching schemas that expose _output", () => {
    // ARRANGE
    const result = driver.run({
      input: "query(z.object({ id: z.number(), name: z.string() }))`SELECT 1`;",
      output: {
        kind: "object",
        value: [
          ["id", { kind: "type", value: "number" }],
          ["name", { kind: "type", value: "string" }],
        ],
      },
    });

    // ASSERT
    expect(result).toBeUndefined();
  });

  it("accepts matching schemas that expose _type", () => {
    // ARRANGE
    const result = driver.run({
      input: "query(schema)`SELECT 1`;",
      declarations: [
        "type LegacySchema<T> = { _type: T };",
        `declare const schema: LegacySchema<{
          tags: string[];
          createdAt: Date | null;
        }>;`,
      ],
      output: {
        kind: "object",
        value: [
          ["tags", { kind: "array", value: { kind: "type", value: "string" } }],
          [
            "createdAt",
            {
              kind: "union",
              value: [
                { kind: "type", value: "Date" },
                { kind: "type", value: "null" },
              ],
            },
          ],
        ],
      },
    });

    // ASSERT
    expect(result).toBeUndefined();
  });

  it("supports custom schemaArgIndex", () => {
    // ARRANGE
    const result = driver.run({
      input: 'query("meta", z.number())`SELECT 1`;',
      output: { kind: "type", value: "number" },
      schemaArgIndex: 1,
    });

    // ASSERT
    expect(result).toBeUndefined();
  });

  it("preserves other arguments when fixing schema at custom index", () => {
    // ARRANGE
    const result = driver.run({
      input: 'query("meta", z.string())`SELECT 1`;',
      output: { kind: "type", value: "number" },
      schemaArgIndex: 1,
    });

    // ASSERT
    expect(result).toBeDefined();
    expect(result?.fix?.text).toBe('query("meta", z.number())');
  });

  it("reports mismatches and preserves the original callee text in fixes", () => {
    // ARRANGE
    const result = driver.run({
      input: "db.query(z.object({ id: z.string() }))`SELECT 1`;",
      declarations: [
        `declare const db: {
          query: (...args: unknown[]) => (
            strings: TemplateStringsArray,
            ...values: unknown[]
          ) => unknown;
        };`,
      ],
      output: {
        kind: "object",
        value: [["id", { kind: "type", value: "number" }]],
      },
    });

    // ASSERT
    expect(result).toBeDefined();
    expect(result?.message).toBe(
      "Zod schema does not match query result.\n\tExpected: z.object({ id: z.number() })",
    );
    expect(result?.fix?.text).toBe("db.query(z.object({ id: z.number() }))");
  });

  it("renders object, array, quoted keys, nullable dates, and literals in fixes", () => {
    // ARRANGE
    const result = driver.run({
      input: "query(z.object({ ok: z.boolean() }))`SELECT 1`;",
      output: {
        kind: "object",
        value: [
          ["items", { kind: "array", value: { kind: "type", value: "string" } }],
          ["display-name", { kind: "type", value: "string" }],
          [
            "deletedAt",
            {
              kind: "union",
              value: [
                { kind: "type", value: "Date" },
                { kind: "type", value: "null" },
              ],
            },
          ],
          [
            "status",
            {
              kind: "literal",
              value: "'draft'",
              base: { kind: "type", value: "string" },
            },
          ],
        ],
      },
    });

    // ASSERT
    expect(result).toBeDefined();
    expect(result?.fix?.text).toBe(
      "query(z.object({ items: z.array(z.string()), \"display-name\": z.string(), deletedAt: z.date().nullable(), status: z.literal('draft') }))",
    );
  });

  it("renders general unions and unsupported types with a z.any fallback", () => {
    // ARRANGE
    const result = driver.run({
      input: "query(z.number())`SELECT 1`;",
      output: {
        kind: "union",
        value: [
          { kind: "type", value: "string" },
          { kind: "type", value: "Map<string, number>" },
          { kind: "type", value: "null" },
        ],
      },
    });

    // ASSERT
    expect(result).toBeDefined();
    expect(result?.fix?.text).toBe("query(z.union([z.string(), z.any(), z.null()]))");
  });

  it("accepts literal schema matching literal output", () => {
    // ARRANGE
    const result = driver.run({
      input: 'query(z.literal("draft"))`SELECT 1`;',
      output: {
        kind: "literal",
        value: '"draft"',
        base: { kind: "type", value: "string" },
      },
    });

    // ASSERT
    expect(result).toBeUndefined();
  });
});
