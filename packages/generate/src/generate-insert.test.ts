import { normalizeIndent } from "@ts-safeql/shared";
import { generateTestDatabaseName, setupTestDatabase } from "@ts-safeql/test-utils";
import { Sql } from "postgres";
import { afterAll, beforeAll, describe, test } from "vitest";
import { createTestQuery } from "./test-utils";

type SQL = Sql<Record<string, unknown>>;

let sql!: SQL;
let dropFn!: () => Promise<number>;

let testQuery: ReturnType<typeof createTestQuery>;

beforeAll(async () => {
  const testDatabase = await setupTestDatabase({
    databaseName: generateTestDatabaseName(),
    postgresUrl: "postgres://postgres:postgres@localhost:5432/postgres",
  });

  dropFn = testDatabase.drop;
  sql = testDatabase.sql;

  testQuery = createTestQuery(sql);
});

afterAll(async () => {
  await sql.end();
  await dropFn();
});

describe("INSERT validation", () => {
  test("insert forgetting non-nullable column should error", async () => {
    await testQuery({
      schema: `CREATE TABLE test_tbl (id SERIAL PRIMARY KEY, required TEXT NOT NULL);`,
      query: `INSERT INTO test_tbl (id) VALUES (1)`,
      expectedError: normalizeIndent`
        null value in column "required" violates not-null constraint
        Hint: Columns "required" are not nullable and have no default value.
      `,
    });
  });

  test("insert with non-nullable default column is fine", async () => {
    await testQuery({
      schema: `CREATE TABLE test_tbl (id SERIAL PRIMARY KEY, required TEXT NOT NULL, defaulted TEXT NOT NULL DEFAULT 'def');`,
      query: `INSERT INTO test_tbl (required) VALUES ('val') RETURNING *`,
      expected: [
        ["id", { kind: "type", value: "number", type: "int4" }],
        ["required", { kind: "type", value: "string", type: "text" }],
        ["defaulted", { kind: "type", value: "string", type: "text" }],
      ],
      unknownColumns: ["id", "required", "defaulted"],
    });
  });

  test("insert with different case should still error", async () => {
    await testQuery({
      schema: `CREATE TABLE test_tbl (id SERIAL PRIMARY KEY, required TEXT NOT NULL);`,
      query: `INSERT INTO test_tbl (id) VALUES (1)`,
      expectedError: normalizeIndent`
        null value in column "required" violates not-null constraint
        Hint: Columns "required" are not nullable and have no default value.
      `,
    });
  });

  test("INSERT DEFAULT VALUES with all columns having defaults or identity", async () => {
    await testQuery({
      schema: `
        CREATE TABLE test_tbl (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL DEFAULT 'default',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `,
      query: `INSERT INTO test_tbl DEFAULT VALUES RETURNING *`,
      expected: [
        ["id", { kind: "type", value: "number", type: "int4" }],
        ["name", { kind: "type", value: "string", type: "text" }],
        ["created_at", { kind: "type", value: "Date", type: "timestamptz" }],
      ],
      unknownColumns: ["id", "name", "created_at"],
    });
  });

  test("INSERT DEFAULT VALUES with missing non-nullable column should error", async () => {
    await testQuery({
      schema: `
        CREATE TABLE test_tbl (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `,
      query: `INSERT INTO test_tbl DEFAULT VALUES`,
      expectedError: normalizeIndent`
        null value in column "name" violates not-null constraint
        Hint: Columns "name" are not nullable and have no default value.
      `,
    });
  });

  test("INSERT with SELECT should validate target columns", async () => {
    await testQuery({
      schema: `
        CREATE TABLE source_tbl (id INT, name TEXT);
        CREATE TABLE target_tbl (id SERIAL PRIMARY KEY, name TEXT NOT NULL, required TEXT NOT NULL);
      `,
      query: `INSERT INTO target_tbl (id, name) SELECT id, name FROM source_tbl`,
      expectedError: normalizeIndent`
        null value in column "required" violates not-null constraint
        Hint: Columns "required" are not nullable and have no default value.
      `,
    });
  });

  test("INSERT with SELECT providing all required columns should succeed", async () => {
    await testQuery({
      schema: `
        CREATE TABLE source_tbl (id INT, name TEXT, required TEXT);
        CREATE TABLE target_tbl (id SERIAL PRIMARY KEY, name TEXT NOT NULL, required TEXT NOT NULL);
      `,
      query: `INSERT INTO target_tbl (name, required) SELECT name, required FROM source_tbl RETURNING *`,
      expected: [
        ["id", { kind: "type", value: "number", type: "int4" }],
        ["name", { kind: "type", value: "string", type: "text" }],
        ["required", { kind: "type", value: "string", type: "text" }],
      ],
      unknownColumns: ["id", "name", "required"],
    });
  });

  test("INSERT with OVERRIDING SYSTEM VALUE should still validate other columns", async () => {
    await testQuery({
      schema: `
        CREATE TABLE test_tbl (
          id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
          name TEXT NOT NULL
        );
      `,
      query: `INSERT INTO test_tbl (id) OVERRIDING SYSTEM VALUE VALUES (1)`,
      expectedError: normalizeIndent`
        null value in column "name" violates not-null constraint
        Hint: Columns "name" are not nullable and have no default value.
      `,
    });
  });

  test("INSERT with OVERRIDING USER VALUE should still validate other columns", async () => {
    await testQuery({
      schema: `
        CREATE TABLE test_tbl (
          id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
          name TEXT NOT NULL
        );
      `,
      query: `INSERT INTO test_tbl (id, name) OVERRIDING USER VALUE VALUES (1, 'test') RETURNING *`,
      expected: [
        ["id", { kind: "type", value: "number", type: "int4" }],
        ["name", { kind: "type", value: "string", type: "text" }],
      ],
      unknownColumns: ["id", "name"],
    });
  });

  test("INSERT with ON CONFLICT should still validate INSERT part", async () => {
    await testQuery({
      schema: `
        CREATE TABLE test_tbl (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          unique_col TEXT UNIQUE
        );
      `,
      query: `INSERT INTO test_tbl (id) VALUES (1) ON CONFLICT (unique_col) DO NOTHING`,
      expectedError: normalizeIndent`
        null value in column "name" violates not-null constraint
        Hint: Columns "name" are not nullable and have no default value.
      `,
    });
  });

  test("INSERT with generated columns should not require them", async () => {
    await testQuery({
      schema: `
        CREATE TABLE test_tbl (
          id INT NOT NULL,
          doubled INT GENERATED ALWAYS AS (id * 2) STORED,
          name TEXT NOT NULL
        );
      `,
      query: `INSERT INTO test_tbl (id, name) VALUES (1, 'test') RETURNING *`,
      expected: [
        ["id", { kind: "type", value: "number", type: "int4" }],
        [
          "doubled",
          {
            kind: "union",
            value: [
              { kind: "type", value: "number", type: "int4" },
              { kind: "type", value: "null", type: "null" },
            ],
          },
        ],
        ["name", { kind: "type", value: "string", type: "text" }],
      ],
      unknownColumns: ["id", "doubled", "name"],
    });
  });

  test("multi-row INSERT should validate columns once", async () => {
    await testQuery({
      schema: `
        CREATE TABLE test_tbl (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL
        );
      `,
      query: `INSERT INTO test_tbl (id) VALUES (1), (2), (3)`,
      expectedError: normalizeIndent`
        null value in column "name" violates not-null constraint
        Hint: Columns "name" are not nullable and have no default value.
      `,
    });
  });

  test("INSERT with CTE should validate target columns", async () => {
    await testQuery({
      schema: `
        CREATE TABLE test_tbl (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          required TEXT NOT NULL
        );
      `,
      query: `
        WITH data AS (SELECT 1 as id, 'test' as name)
        INSERT INTO test_tbl (id, name) SELECT * FROM data
      `,
      expectedError: normalizeIndent`
        null value in column "required" violates not-null constraint
        Hint: Columns "required" are not nullable and have no default value.
      `,
    });
  });

  test("INSERT into inherited table should validate all required columns", async () => {
    await testQuery({
      schema: `
        CREATE TABLE parent_tbl (
          id SERIAL PRIMARY KEY,
          parent_name TEXT NOT NULL
        );
        CREATE TABLE child_tbl (
          child_name TEXT NOT NULL
        ) INHERITS (parent_tbl);
      `,
      query: `INSERT INTO child_tbl (parent_name) VALUES ('test')`,
      expectedError: normalizeIndent`
        null value in column "child_name" violates not-null constraint
        Hint: Columns "child_name" are not nullable and have no default value.
      `,
    });
  });
});
