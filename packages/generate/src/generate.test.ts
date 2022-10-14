import { InternalError } from "@ts-safeql/shared";
import { generateTestDatabaseName, setupTestDatabase } from "@ts-safeql/test-utils";
import assert from "assert";
import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/Option";
import { flow, identity, pipe } from "fp-ts/function";
import { parseQuery } from "libpg-query";
import { before, test } from "mocha";
import { Sql } from "postgres";
import { createGenerator, GenerateParams } from "./generate";

type SQL = Sql<Record<string, unknown>>;

function runMigrations(sql: SQL) {
  return sql.unsafe(`
    CREATE TABLE caregiver (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL
    );

    CREATE TABLE agency (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        name TEXT NOT NULL
    );

    CREATE TABLE caregiver_agency (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        caregiver_id INT NOT NULL REFERENCES caregiver(id),
        agency_id INT NOT NULL REFERENCES agency(id)
    );
  `);
}

let sql!: SQL;
let dropFn!: () => Promise<number>;
let generate!: ReturnType<typeof createGenerator>["generate"];

before(async () => {
  const testDatabase = await setupTestDatabase({
    databaseName: generateTestDatabaseName(),
    postgresUrl: "postgres://postgres:postgres@localhost:5432/postgres",
  });
  const generator = createGenerator();

  dropFn = testDatabase.drop;
  sql = testDatabase.sql;
  generate = generator.generate;

  await runMigrations(sql);
});

after(async () => {
  await sql.end();
  await dropFn();
});

const generateTE = (params: GenerateParams) =>
  pipe(TE.tryCatch(() => generate(params), InternalError.to));

const generateTE2 = flow(generate, (x) => TE.tryCatch(() => x, InternalError.to));
const parseQueryTE = flow(parseQuery, TE.tryCatchK(identity, InternalError.to));

const testQuery = async (params: { query: string; expected?: unknown; expectedError?: string }) => {
  const { query } = params;
  const cacheKey = "test";

  return pipe(
    TE.Do,
    TE.bind("pgParsed", () => parseQueryTE(params.query)),
    TE.bind("result", ({ pgParsed }) =>
      generateTE2({ sql, pgParsed, query, cacheKey, fieldTransform: undefined })
    ),
    TE.chainW(({ result }) => TE.fromEither(result)),
    TE.match(
      (error) =>
        pipe(
          params.expectedError,
          O.fromNullable,
          O.fold(
            () => assert.fail(error.message),
            (expectedError) => assert.strictEqual(error.message, expectedError)
          )
        ),
      ({ result }) => assert.equal(result, params.expected)
    )
  )();
};

test("(init generate cache)", async () => {
  await testQuery({
    query: `SELECT 1 as x`,
    expected: `{ x: number; }`,
  });
});

test("select columns", async () => {
  await testQuery({
    query: `SELECT id, first_name, last_name from caregiver LIMIT 1`,
    expected: `{ id: number; first_name: string; last_name: string; }`,
  });
});

test("select column as camelCase", async () => {
  await testQuery({
    query: `SELECT first_name as "firstName" from caregiver LIMIT 1`,
    expected: `{ firstName: string; }`,
  });
});

test("select non-table column", async () =>
  await testQuery({
    query: `SELECT 1 as count`,
    expected: `{ count: number; }`,
  }));

test("select with an inner join", async () => {
  await testQuery({
    query: `
        SELECT
            caregiver.id as caregiver_id,
            caregiver_agency.id as assoc_id
        FROM caregiver
            JOIN caregiver_agency ON caregiver.id = caregiver_agency.caregiver_id
    `,
    expected: `{ caregiver_id: number; assoc_id: number; }`,
  });
});

test("select with left join should return all cols from left join as nullable", async () => {
  await testQuery({
    query: `
        SELECT
            caregiver.id as caregiver_id,
            caregiver_agency.id as assoc_id
        FROM caregiver
            LEFT JOIN caregiver_agency ON caregiver.id = caregiver_agency.caregiver_id
    `,
    expected: `{ caregiver_id: number; assoc_id: number | null; }`,
  });
});

test("select with duplicate columns should throw duplicate columns error", async () => {
  await testQuery({
    query: `
        SELECT
          caregiver.id,
          caregiver_agency.id
        FROM caregiver
            JOIN caregiver_agency ON caregiver.id = caregiver_agency.caregiver_id
    `,
    expectedError: "Duplicate columns: caregiver.id, caregiver_agency.id",
  });
});

test("insert into table with returning", async () => {
  await testQuery({
    query: `INSERT INTO caregiver (first_name, last_name) VALUES (null, null) RETURNING id`,
    expected: `{ id: number; }`,
  });
});

test("insert into table without returning", async () => {
  await testQuery({
    query: `INSERT INTO caregiver (first_name, last_name) VALUES (null, null)`,
    expected: null,
  });
});

test("select with incorrect operation", async () => {
  await testQuery({
    query: `SELECT id FROM caregiver WHERE first_name = 1`,
    expectedError: "operator does not exist: text = integer",
  });
});

test("select where int column = any(array)", async () => {
  await testQuery({
    query: `SELECT id FROM caregiver WHERE id = ANY($1::int[])`,
    expected: "{ id: number; }",
  });
});

test("select with syntax error", async () => {
  await testQuery({
    query: `SELECT id FROM caregiver WHERE`,
    expectedError: "Internal error: syntax error at end of input",
  });
});
