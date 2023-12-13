import { InternalError, normalizeIndent } from "@ts-safeql/shared";
import { generateTestDatabaseName, setupTestDatabase } from "@ts-safeql/test-utils";
import assert from "assert";
import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/Option";
import { flow, identity, pipe } from "fp-ts/function";
import { parseQuery } from "libpg-query";
import { before, test } from "mocha";
import { Sql } from "postgres";
import { ResolvedTargetEntry, createGenerator } from "./generate";

type SQL = Sql<Record<string, unknown>>;

function runMigrations(sql: SQL) {
  return sql.unsafe(`
    CREATE TYPE certification AS ENUM ('HHA', 'RN', 'LPN', 'CNA', 'PCA', 'OTHER');
    CREATE DOMAIN phone_number AS TEXT CHECK (VALUE ~ '^[0-9]{3}-[0-9]{3}-[0-9]{4}$');

    CREATE TABLE caregiver (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL
    );

    CREATE TABLE caregiver_certification (
      caregiver_id INTEGER NOT NULL REFERENCES caregiver(id),
      certification certification NOT NULL
    );

    CREATE TABLE caregiver_phonenumber (
      caregiver_id INTEGER NOT NULL REFERENCES caregiver(id),
      phone_number phone_number NOT NULL
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

    CREATE TABLE test_date_column (
        date_col DATE NOT NULL,
        date_array date[] NOT NULL,
        instant_arr timestamptz[] NOT NULL,
        time_arr time[] NOT NULL,
        timetz_arr timetz[] NOT NULL,
        local_date_time_arr timestamp[] NOT NULL,
        nullable_date_arr date[] NULL
    );
  `);
}

let sql!: SQL;
let dropFn!: () => Promise<number>;

before(async () => {
  const testDatabase = await setupTestDatabase({
    databaseName: generateTestDatabaseName(),
    postgresUrl: "postgres://postgres:postgres@localhost:5432/postgres",
  });

  dropFn = testDatabase.drop;
  sql = testDatabase.sql;

  await runMigrations(sql);
});

after(async () => {
  await sql.end();
  await dropFn();
});

const { generate } = createGenerator();
const generateTE = flow(generate, TE.tryCatchK(identity, InternalError.to));
const parseQueryTE = flow(parseQuery, TE.tryCatchK(identity, InternalError.to));

const testQuery = async (params: {
  query: string;
  expected?: ResolvedTargetEntry[] | null;
  expectedError?: string;
}) => {
  const { query } = params;

  const cacheKey = "test";

  return pipe(
    TE.Do,
    TE.bind("pgParsed", () => parseQueryTE(params.query)),
    TE.bind("result", ({ pgParsed }) =>
      generateTE({ sql, pgParsed, query, cacheKey, fieldTransform: undefined })
    ),
    TE.chainW(({ result }) => TE.fromEither(result)),
    TE.match(
      (error) =>
        pipe(
          params.expectedError,
          O.fromNullable,
          O.fold(
            () => assert.fail(error),
            (expectedError) => assert.strictEqual(error.message, expectedError)
          )
        ),
      ({ output }) => assert.deepEqual(output?.value ?? null, params.expected)
    )
  )();
};

test("(init generate cache)", async () => {
  await testQuery({
    query: `SELECT 1 as x`,
    expected: [["x", { kind: "type", value: "number" }]],
  });
});

test("select columns", async () => {
  await testQuery({
    query: `SELECT id, first_name, last_name from caregiver LIMIT 1`,
    expected: [
      ["id", { kind: "type", value: "number" }],
      ["first_name", { kind: "type", value: "string" }],
      ["last_name", { kind: "type", value: "string" }],
    ],
  });
});

test("select column as camelCase", async () => {
  await testQuery({
    query: `SELECT first_name as "firstName" from caregiver LIMIT 1`,
    expected: [["firstName", { kind: "type", value: "string" }]],
  });
});

test("select non-table column", async () =>
  await testQuery({
    query: `SELECT 1 as count`,
    expected: [["count", { kind: "type", value: "number" }]],
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
    expected: [
      ["caregiver_id", { kind: "type", value: "number" }],
      ["assoc_id", { kind: "type", value: "number" }],
    ],
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
    expected: [
      ["caregiver_id", { kind: "type", value: "number" }],
      [
        "assoc_id",
        {
          kind: "union",
          value: [
            { kind: "type", value: "number" },
            { kind: "type", value: "null" },
          ],
        },
      ],
    ],
  });
});

test("select with right join should return all cols from the other table as nullable", async () => {
  await testQuery({
    query: `
        SELECT
            caregiver.id as caregiver_id,
            caregiver_agency.id as assoc_id
        FROM caregiver
            RIGHT JOIN caregiver_agency ON caregiver.id = caregiver_agency.caregiver_id
    `,
    expected: [
      [
        "caregiver_id",
        {
          kind: "union",
          value: [
            { kind: "type", value: "number" },
            { kind: "type", value: "null" },
          ],
        },
      ],
      ["assoc_id", { kind: "type", value: "number" }],
    ],
  });
});

test("select with full join should return all cols as nullable", async () => {
  await testQuery({
    query: `
        SELECT
            caregiver.id as caregiver_id,
            caregiver_agency.id as assoc_id
        FROM caregiver
            FULL JOIN caregiver_agency ON caregiver.id = caregiver_agency.caregiver_id
    `,
    expected: [
      [
        "caregiver_id",
        {
          kind: "union",
          value: [
            { kind: "type", value: "number" },
            { kind: "type", value: "null" },
          ],
        },
      ],
      [
        "assoc_id",
        {
          kind: "union",
          value: [
            { kind: "type", value: "number" },
            { kind: "type", value: "null" },
          ],
        },
      ],
    ],
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
    expected: [["id", { kind: "type", value: "number" }]],
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
    expected: [["id", { kind: "type", value: "number" }]],
  });
});

test("select with syntax error", async () => {
  await testQuery({
    query: `SELECT id FROM caregiver WHERE`,
    expectedError: "Internal error: syntax error at end of input",
  });
});

test("select date columns", async () => {
  await testQuery({
    query: `SELECT * FROM test_date_column`,
    expected: [
      ["date_col", { kind: "type", value: "Date" }],
      ["date_array", { kind: "array", value: { kind: "type", value: "Date" } }],
      ["instant_arr", { kind: "array", value: { kind: "type", value: "Date" } }],
      ["time_arr", { kind: "array", value: { kind: "type", value: "string" } }],
      ["timetz_arr", { kind: "array", value: { kind: "type", value: "string" } }],
      ["local_date_time_arr", { kind: "array", value: { kind: "type", value: "Date" } }],
      [
        "nullable_date_arr",
        {
          kind: "union",
          value: [
            { kind: "array", value: { kind: "type", value: "Date" } },
            { kind: "type", value: "null" },
          ],
        },
      ],
    ],
  });
});

test("select enum", async () => {
  await testQuery({
    query: `SELECT certification from caregiver_certification`,
    expected: [
      [
        "certification",
        {
          kind: "union",
          value: [
            { kind: "type", value: "'HHA'" },
            { kind: "type", value: "'RN'" },
            { kind: "type", value: "'LPN'" },
            { kind: "type", value: "'CNA'" },
            { kind: "type", value: "'PCA'" },
            { kind: "type", value: "'OTHER'" },
          ],
        },
      ],
    ],
  });
});

test("select domain type", async () => {
  await testQuery({
    query: `SELECT phone_number from caregiver_phonenumber`,
    expected: [["phone_number", { kind: "type", value: "string" }]],
  });
});

test("select from subselect with an alias", async () => {
  await testQuery({
    query: `
      SELECT subselect.id FROM (SELECT * FROM caregiver) AS subselect
    `,
    expected: [["id", { kind: "type", value: "number" }]],
  });
});

test("select from subselect with a join", async () => {
  await testQuery({
    query: `
    SELECT caregiver.first_name
    FROM
      (SELECT 1 as id) as subselect1
        LEFT JOIN caregiver ON subselect1.id = caregiver.id
    `,
    expected: [
      [
        "first_name",
        {
          kind: "union",
          value: [
            { kind: "type", value: "string" },
            { kind: "type", value: "null" },
          ],
        },
      ],
    ],
  });
});

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
        { kind: "object", value: [["key", { kind: "type", value: "string" }]] },
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
            ["deeply", { kind: "object", value: [["nested", { kind: "type", value: "string" }]] }],
          ],
        },
      ],
    ],
  });
});

test("select jsonb_build_object(const, columnref)", async () => {
  await testQuery({
    query: `SELECT json_build_object('id', agency.id) FROM agency`,
    expected: [
      ["json_build_object", { kind: "object", value: [["id", { kind: "type", value: "number" }]] }],
    ],
  });
});

test("select jsonb_build_object(const, columnref::text)", async () => {
  await testQuery({
    query: `SELECT json_build_object('id', agency.id::text) FROM agency`,
    expected: [
      ["json_build_object", { kind: "object", value: [["id", { kind: "type", value: "string" }]] }],
    ],
  });
});

test("select jsonb_build_object(const, const::text::int)", async () => {
  await testQuery({
    query: `SELECT json_build_object('id', 1::text::int)`,
    expected: [
      ["json_build_object", { kind: "object", value: [["id", { kind: "type", value: "number" }]] }],
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
          value: [["id", { kind: "array", value: { kind: "type", value: "number" } }]],
        },
      ],
    ],
  });
});

test("select jsonb_agg(tbl)", async () => {
  await testQuery({
    query: `SELECT jsonb_agg(agency) FROM agency`,
    expected: [
      [
        "jsonb_agg",
        {
          kind: "array",
          value: {
            kind: "object",
            value: [
              ["id", { kind: "type", value: "number" }],
              ["name", { kind: "type", value: "string" }],
            ],
          },
        },
      ],
    ],
  });
});

test("select json_agg(tbl) as colname", async () => {
  await testQuery({
    query: `SELECT json_agg(agency) as colname FROM agency`,
    expected: [
      [
        "colname",
        {
          kind: "array",
          value: {
            kind: "object",
            value: [
              ["id", { kind: "type", value: "number" }],
              ["name", { kind: "type", value: "string" }],
            ],
          },
        },
      ],
    ],
  });
});

test("select jsonb_agg(alias) from tbl alias", async () => {
  await testQuery({
    query: `SELECT jsonb_agg(a) FROM agency a`,
    expected: [
      [
        "jsonb_agg",
        {
          kind: "array",
          value: {
            kind: "object",
            value: [
              ["id", { kind: "type", value: "number" }],
              ["name", { kind: "type", value: "string" }],
            ],
          },
        },
      ],
    ],
  });
});

test("select jsonb_agg(aliasname.col)", async () => {
  await testQuery({
    query: `SELECT jsonb_agg(a.id) FROM agency a`,
    expected: [["jsonb_agg", { kind: "array", value: { kind: "type", value: "number" } }]],
  });
});

test("select jsonb_agg(jsonb_build_object(const, const))", async () => {
  await testQuery({
    query: `SELECT jsonb_agg(jsonb_build_object('key', 'value'))`,
    expected: [
      [
        "jsonb_agg",
        {
          kind: "array",
          value: {
            kind: "object",
            value: [["key", { kind: "type", value: "string" }]],
          },
        },
      ],
    ],
  });
});

test("select jsonb_agg(jsonb_build_object(const, tbl.col))", async () => {
  await testQuery({
    query: `SELECT jsonb_agg(json_build_object('id', agency.id)) FROM agency`,
    expected: [
      [
        "jsonb_agg",
        {
          kind: "array",
          value: { kind: "object", value: [["id", { kind: "type", value: "number" }]] },
        },
      ],
    ],
  });
});

test("select jsonb_agg(jsonb_build_object(const, col)) from tbl", async () => {
  await testQuery({
    query: `SELECT jsonb_agg(json_build_object('id', id)) FROM agency`,
    expected: [
      [
        "jsonb_agg",
        {
          kind: "array",
          value: { kind: "object", value: [["id", { kind: "type", value: "number" }]] },
        },
      ],
    ],
  });
});

test("select jsonb_agg all use cases", async () => {
  await testQuery({
    query: `
    SELECT
      agency.id,
      jsonb_agg(c) as jsonb_tbl,
      jsonb_agg(c.*) as jsonb_tbl_star,
      jsonb_agg(c.id) as jsonb_tbl_col,
      jsonb_agg(json_build_object('firstName', c.first_name)) as jsonb_object
    FROM agency
      JOIN caregiver_agency ON agency.id = caregiver_agency.agency_id
      JOIN caregiver c ON c.id = caregiver_agency.caregiver_id
    GROUP BY agency.id
    `,
    expected: [
      ["id", { kind: "type", value: "number" }],
      [
        "jsonb_tbl",
        {
          kind: "array",
          value: {
            kind: "object",
            value: [
              ["id", { kind: "type", value: "number" }],
              ["first_name", { kind: "type", value: "string" }],
              ["last_name", { kind: "type", value: "string" }],
            ],
          },
        },
      ],
      [
        "jsonb_tbl_star",
        {
          kind: "array",
          value: {
            kind: "object",
            value: [
              ["id", { kind: "type", value: "number" }],
              ["first_name", { kind: "type", value: "string" }],
              ["last_name", { kind: "type", value: "string" }],
            ],
          },
        },
      ],
      ["jsonb_tbl_col", { kind: "array", value: { kind: "type", value: "number" } }],
      [
        "jsonb_object",
        {
          kind: "array",
          value: { kind: "object", value: [["firstName", { kind: "type", value: "string" }]] },
        },
      ],
    ],
  });
});
