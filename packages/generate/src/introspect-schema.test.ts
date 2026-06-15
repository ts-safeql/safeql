import { generateTestDatabaseName, setupTestDatabase } from "@ts-safeql/test-utils";
import { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createGenerator } from "./generate";

type SQL = Sql<Record<string, unknown>>;

let sql!: SQL;
let dropFn!: () => Promise<number>;

const generator = createGenerator();

beforeAll(async () => {
  const testDatabase = await setupTestDatabase({
    databaseName: generateTestDatabaseName(),
    postgresUrl: "postgres://postgres:postgres@localhost:5432/postgres",
  });

  dropFn = testDatabase.drop;
  sql = testDatabase.sql;

  await sql.unsafe(`
    CREATE TYPE mood AS ENUM ('happy', 'sad');
    CREATE TABLE person (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      first_name TEXT NOT NULL,
      bio TEXT,
      tags TEXT[],
      current_mood mood
    );
    CREATE SCHEMA private;
    CREATE TABLE private.secret (id INTEGER PRIMARY KEY);
  `);
});

afterAll(async () => {
  await sql.end();
  await dropFn();
});

function findTable<T extends { tableName: string }>(tables: T[], name: string): T | undefined {
  return tables.find((t) => t.tableName === name);
}

describe("introspectSchema", () => {
  test("resolves each column to the same ResolvedTarget shape generate produces", async () => {
    const result = await generator.introspectSchema({
      sql,
      cacheKey: "test",
      cacheMetadata: false,
      fieldTransform: undefined,
    });

    const person = findTable(result.tables, "person");
    expect(person).toBeDefined();
    expect(person?.columns).toEqual([
      ["id", { kind: "type", value: "number", type: "int4" }],
      ["first_name", { kind: "type", value: "string", type: "text" }],
      [
        "bio",
        {
          kind: "union",
          value: [
            { kind: "type", value: "string", type: "text" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
      [
        "tags",
        {
          kind: "union",
          value: [
            { kind: "array", value: { kind: "type", value: "string", type: "text" } },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
      [
        "current_mood",
        {
          kind: "union",
          value: [
            {
              kind: "union",
              value: [
                { kind: "type", value: "'happy'", type: "mood" },
                { kind: "type", value: "'sad'", type: "mood" },
              ],
            },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ]);
  });

  test("excludes system schemas but includes user-defined schemas", async () => {
    const result = await generator.introspectSchema({
      sql,
      cacheKey: "test2",
      cacheMetadata: false,
      fieldTransform: undefined,
    });

    const schemas = new Set(result.tables.map((t) => t.schemaName));
    expect(schemas.has("pg_catalog")).toBe(false);
    expect(schemas.has("information_schema")).toBe(false);
    expect(findTable(result.tables, "secret")?.schemaName).toBe("private");
  });

  test("respects an explicit schema allowlist", async () => {
    const result = await generator.introspectSchema({
      sql,
      cacheKey: "test3",
      cacheMetadata: false,
      fieldTransform: undefined,
      schemas: ["public"],
    });

    const schemas = new Set(result.tables.map((t) => t.schemaName));
    expect(schemas.has("public")).toBe(true);
    expect(schemas.has("private")).toBe(false);
  });

  test("applies fieldTransform to column names", async () => {
    const result = await generator.introspectSchema({
      sql,
      cacheKey: "test4",
      cacheMetadata: false,
      fieldTransform: "camel",
    });

    const person = findTable(result.tables, "person");
    const names = person?.columns.map(([name]) => name);
    expect(names).toContain("firstName");
    expect(names).toContain("currentMood");
  });
});
