import assert from "assert";
import { before, test } from "mocha";
import { nanoid } from "nanoid";
import { Sql } from "postgres";
import { generate, prepareCache } from "./generate";
import { setupTestDatabase } from "./tests/setupTestDb";
import either from "./utils/either";

type SQL = Sql<Record<string, unknown>>;

function runMigrations(sql: SQL) {
  return sql.unsafe(`
    CREATE TABLE caregiver (
        id SERIAL PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL
    );

    CREATE TABLE agency (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
    );

    CREATE TABLE caregiver_agency (
        id SERIAL PRIMARY KEY,
        caregiver_id INT NOT NULL REFERENCES caregiver(id),
        agency_id INT NOT NULL REFERENCES agency(id)
    );
  `);
}

let sql!: SQL;
let dropFn!: () => Promise<number>;

before(async () => {
  const databaseName = `test_${nanoid()}`;
  const testDatabase = await setupTestDatabase({
    databaseName,
    postgresUrl: "postgres://postgres:postgres@localhost:5432/postgres",
  });

  dropFn = testDatabase.drop;
  sql = testDatabase.sql;

  await runMigrations(sql);
  await prepareCache(sql);
});

after(async () => {
  await sql.end();
  await dropFn();
});

const testQuery = async (params: { query: string; expected?: unknown; expectedError?: string }) => {
  const result = await generate({ sql: sql, query: params.query });

  if (either.isLeft(result)) {
    return params.expectedError !== undefined
      ? assert.equal(result.left.error, params.expectedError)
      : assert.fail(result.left.error);
  }

  assert.equal(result.right.result, params.expected);
};

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
    expected: `{ count: Unknown<number>; }`,
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
    expected: `{ caregiver_id: number; assoc_id: Nullable<number>; }`,
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
    expectedError: "duplicate columns: caregiver.id, caregiver_agency.id",
  });
});

test("insert into table", async () => {
  await testQuery({
    query: `INSERT INTO caregiver (first_name, last_name) VALUES (null, null) RETURNING id`,
    expected: `{ id: number; }`,
  });
});
