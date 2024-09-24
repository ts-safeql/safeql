import { InternalError, normalizeIndent } from "@ts-safeql/shared";
import { generateTestDatabaseName, setupTestDatabase } from "@ts-safeql/test-utils";
import assert from "assert";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";
import { flow, identity, pipe } from "fp-ts/lib/function";
import { parseQuery } from "libpg-query";
import { beforeAll, afterAll, test } from "vitest";
import { Sql } from "postgres";
import { GenerateParams, ResolvedTargetEntry, createGenerator } from "./generate";

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

    CREATE TABLE test_nullability (
      nullable_col TEXT
    );

    CREATE TABLE test_jsonb (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      nullable_col TEXT
    );
    
    CREATE TYPE overriden_enum AS ENUM ('foo', 'bar');
    
    CREATE TABLE test_overriden_enum (
      col overriden_enum NOT NULL,
      nullable_col overriden_enum
    );

    CREATE DOMAIN overriden_domain AS TEXT CHECK (VALUE ~ '^[0-9]{3}-[0-9]{3}-[0-9]{4}$');

    CREATE TABLE test_overriden_domain (
      col overriden_domain NOT NULL,
      nullable_col overriden_domain
    );

    CREATE TABLE all_types (
      id SERIAL PRIMARY KEY NOT NULL,
      text_column TEXT NOT NULL,
      varchar_column VARCHAR(255) NOT NULL,
      char_column CHAR(10) NOT NULL,
      int_column INTEGER NOT NULL,
      smallint_column SMALLINT NOT NULL,
      bigint_column BIGINT NOT NULL,
      decimal_column DECIMAL(10, 2) NOT NULL,
      numeric_column NUMERIC(14, 4) NOT NULL,
      real_column REAL NOT NULL,
      double_column DOUBLE PRECISION NOT NULL,
      serial_column SERIAL NOT NULL,
      bigserial_column BIGSERIAL NOT NULL,
      boolean_column BOOLEAN NOT NULL,
      date_column DATE NOT NULL,
      time_column TIME NOT NULL,
      time_with_timezone_column TIME WITH TIME ZONE NOT NULL,
      timestamp_column TIMESTAMP NOT NULL,
      timestamp_with_timezone_column TIMESTAMP WITH TIME ZONE NOT NULL,
      interval_column INTERVAL NOT NULL,
      uuid_column UUID NOT NULL,
      json_column JSON NOT NULL,
      jsonb_column JSONB NOT NULL,
      array_text_column TEXT[] NOT NULL,
      array_int_column INTEGER[] NOT NULL,
      bytea_column BYTEA NOT NULL,
      inet_column INET NOT NULL,
      cidr_column CIDR NOT NULL,
      macaddr_column MACADDR NOT NULL,
      macaddr8_column MACADDR8 NOT NULL,
      tsvector_column TSVECTOR NOT NULL,
      tsquery_column TSQUERY NOT NULL,
      xml_column XML NOT NULL,
      point_column POINT NOT NULL,
      line_column LINE NOT NULL,
      lseg_column LSEG NOT NULL,
      box_column BOX NOT NULL,
      path_column PATH NOT NULL,
      polygon_column POLYGON NOT NULL,
      circle_column CIRCLE NOT NULL,
      money_column MONEY NOT NULL,
      bit_column BIT(3) NOT NULL,
      bit_varying_column BIT VARYING(5) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS table1 (
      id SERIAL PRIMARY KEY,
      name INTEGER NOT NULL
    );

    CREATE SCHEMA IF NOT EXISTS schema1;
    CREATE TABLE IF NOT EXISTS schema1.table1 (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE SCHEMA IF NOT EXISTS schema2;
    CREATE TABLE IF NOT EXISTS schema2.table1 (
      id SERIAL PRIMARY KEY,
      name TEXT
    );
  `);
}

let sql!: SQL;
let dropFn!: () => Promise<number>;

beforeAll(async () => {
  const testDatabase = await setupTestDatabase({
    databaseName: generateTestDatabaseName(),
    postgresUrl: "postgres://postgres:postgres@localhost:5432/postgres",
  });

  dropFn = testDatabase.drop;
  sql = testDatabase.sql;

  await runMigrations(sql);
});

afterAll(async () => {
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
  options?: Partial<GenerateParams>;
  unknownColumns?: string[];
}) => {
  const { query } = params;

  const cacheKey = "test";

  return pipe(
    TE.Do,
    TE.bind("pgParsed", () => parseQueryTE(params.query)),
    TE.bind("result", ({ pgParsed }) =>
      generateTE({
        sql,
        pgParsed,
        query,
        cacheKey,
        fieldTransform: undefined,
        overrides: {
          types: {
            overriden_enum: "OverridenEnum",
            overriden_domain: "OverridenDomain",
          },
        },
        ...params.options,
      }),
    ),
    TE.chainW(({ result }) => TE.fromEither(result)),
    TE.match(
      (error) =>
        pipe(
          params.expectedError,
          O.fromNullable,
          O.fold(
            () => assert.fail(error.stack),
            (expectedError) => assert.strictEqual(error.message, expectedError),
          ),
        ),
      ({ output, unknownColumns }) => {
        assert.deepEqual(output?.value ?? null, params.expected);

        if (unknownColumns.length > 0) {
          assert.deepEqual(unknownColumns, params.unknownColumns);
        }
      },
    ),
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

test("select all_types", async () => {
  await testQuery({
    query: `SELECT * FROM all_types`,
    expected: [
      ["id", { kind: "type", value: "number" }],
      ["text_column", { kind: "type", value: "string" }],
      ["varchar_column", { kind: "type", value: "string" }],
      ["char_column", { kind: "type", value: "string" }],
      ["int_column", { kind: "type", value: "number" }],
      ["smallint_column", { kind: "type", value: "number" }],
      ["bigint_column", { kind: "type", value: "string" }],
      ["decimal_column", { kind: "type", value: "string" }],
      ["numeric_column", { kind: "type", value: "string" }],
      ["real_column", { kind: "type", value: "number" }],
      ["double_column", { kind: "type", value: "number" }],
      ["serial_column", { kind: "type", value: "number" }],
      ["bigserial_column", { kind: "type", value: "string" }],
      ["boolean_column", { kind: "type", value: "boolean" }],
      ["date_column", { kind: "type", value: "Date" }],
      ["time_column", { kind: "type", value: "string" }],
      ["time_with_timezone_column", { kind: "type", value: "string" }],
      ["timestamp_column", { kind: "type", value: "Date" }],
      ["timestamp_with_timezone_column", { kind: "type", value: "Date" }],
      ["interval_column", { kind: "type", value: "string" }],
      ["uuid_column", { kind: "type", value: "string" }],
      ["json_column", { kind: "type", value: "any" }],
      ["jsonb_column", { kind: "type", value: "any" }],
      ["array_text_column", { kind: "array", value: { kind: "type", value: "string" } }],
      ["array_int_column", { kind: "array", value: { kind: "type", value: "number" } }],
      ["bytea_column", { kind: "type", value: "any" }],
      ["inet_column", { kind: "type", value: "string" }],
      ["cidr_column", { kind: "type", value: "string" }],
      ["macaddr_column", { kind: "type", value: "string" }],
      ["macaddr8_column", { kind: "type", value: "string" }],
      ["tsvector_column", { kind: "type", value: "unknown" }],
      ["tsquery_column", { kind: "type", value: "unknown" }],
      ["xml_column", { kind: "type", value: "unknown" }],
      ["point_column", { kind: "type", value: "unknown" }],
      ["line_column", { kind: "type", value: "unknown" }],
      ["lseg_column", { kind: "type", value: "unknown" }],
      ["box_column", { kind: "type", value: "unknown" }],
      ["path_column", { kind: "type", value: "unknown" }],
      ["polygon_column", { kind: "type", value: "unknown" }],
      ["circle_column", { kind: "type", value: "unknown" }],
      ["money_column", { kind: "type", value: "number" }],
      ["bit_column", { kind: "type", value: "boolean" }],
      ["bit_varying_column", { kind: "type", value: "unknown" }],
    ],
  });
});

test("camel case field transform", async () => {
  await testQuery({
    options: { fieldTransform: "camel" },
    query: `SELECT id, first_name, last_name from caregiver LIMIT 1`,
    expected: [
      ["id", { kind: "type", value: "number" }],
      ["firstName", { kind: "type", value: "string" }],
      ["lastName", { kind: "type", value: "string" }],
    ],
  });
});

test("select true", async () => {
  await testQuery({
    options: { fieldTransform: "camel" },
    query: `SELECT true`,
    expected: [["bool", { kind: "type", value: "boolean" }]],
  });
});

test("select count(1) should be non-nullable", async () => {
  await testQuery({
    query: `SELECT count(1)`,
    expected: [["count", { kind: "type", value: "string" }]],
  });
});

test("select count(1) as col should be non-nullable", async () => {
  await testQuery({
    query: `SELECT count(1) as col`,
    expected: [["col", { kind: "type", value: "string" }]],
  });
});

test("select count(1)::int as col should be non-nullable", async () => {
  await testQuery({
    query: `SELECT count(1)::int as col`,
    expected: [["col", { kind: "type", value: "number" }]],
  });
});

test("SELECT id FROM caregiver tbl WHERE tbl.id IS NOT NULL", async () => {
  await testQuery({
    query: `SELECT id FROM caregiver tbl WHERE tbl.id IS NOT NULL`,
    expected: [["id", { kind: "type", value: "number" }]],
  });
});

test("SELECT tbl.id FROM caregiver tbl WHERE tbl.id IS NOT NULL", async () => {
  await testQuery({
    query: `SELECT tbl.id FROM caregiver tbl WHERE tbl.id IS NOT NULL`,
    expected: [["id", { kind: "type", value: "number" }]],
  });
});

test("select sum", async () => {
  await testQuery({
    query: `SELECT sum(id) from caregiver`,
    expected: [
      [
        "sum",
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

test("select sum(col)::int should still be number | null", async () => {
  await testQuery({
    query: `SELECT sum(id)::int from caregiver where false`,
    expected: [
      [
        "sum",
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

test("select with an inner join without table reference", async () => {
  await testQuery({
    query: `
        SELECT agency_id
        FROM caregiver
            JOIN caregiver_agency ON caregiver.id = caregiver_agency.caregiver_id
    `,
    expected: [["agency_id", { kind: "type", value: "number" }]],
  });
});

test("select exists(subselect)", async () => {
  await testQuery({
    query: `SELECT EXISTS(SELECT 1 FROM caregiver)`,
    expected: [["exists", { kind: "type", value: "boolean" }]],
  });
});

test("select overriden enum", async () => {
  await testQuery({
    query: `SELECT * FROM test_overriden_enum`,
    expected: [
      ["col", { kind: "type", value: "OverridenEnum" }],
      [
        "nullable_col",
        {
          kind: "union",
          value: [
            { kind: "type", value: "OverridenEnum" },
            { kind: "type", value: "null" },
          ],
        },
      ],
    ],
  });
});

test("select overriden domain", async () => {
  await testQuery({
    query: `SELECT * FROM test_overriden_domain`,
    expected: [
      ["col", { kind: "type", value: "OverridenDomain" }],
      [
        "nullable_col",
        {
          kind: "union",
          value: [
            { kind: "type", value: "OverridenDomain" },
            { kind: "type", value: "null" },
          ],
        },
      ],
    ],
  });
});

test("select now()", async () => {
  await testQuery({
    query: `SELECT now()`,
    expected: [["now", { kind: "type", value: "Date" }]],
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
    unknownColumns: ["id"],
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

test("select nullable column with nullabilty check", async () => {
  await testQuery({
    query: `
    SELECT nullable_col FROM test_nullability WHERE nullable_col IS NOT NULL
    `,
    expected: [["nullable_col", { kind: "type", value: "string" }]],
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
                    { kind: "type", value: "number" },
                    { kind: "type", value: "null" },
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

test("select array_agg(col order by col)", async () => {
  await testQuery({
    query: `SELECT array_agg(id ORDER BY id) col FROM agency`,
    expected: [
      [
        "col",
        {
          kind: "union",
          value: [
            { kind: "array", value: { kind: "type", value: "number" } },
            { kind: "type", value: "null" },
          ],
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
          kind: "union",
          value: [
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
            { kind: "type", value: "null" },
          ],
        },
      ],
    ],
  });
});

test("select coalesce(jsonb_agg(tbl), '[]'::jsonb)", async () => {
  await testQuery({
    query: `SELECT coalesce(jsonb_agg(agency), '[]'::jsonb) as col FROM agency`,
    expected: [
      [
        "col",
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
          kind: "union",
          value: [
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
            { kind: "type", value: "null" },
          ],
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
          kind: "union",
          value: [
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
            { kind: "type", value: "null" },
          ],
        },
      ],
    ],
  });
});

test("select jsonb_agg(aliasname.col)", async () => {
  await testQuery({
    query: `SELECT jsonb_agg(a.id) FROM agency a`,
    expected: [
      [
        "jsonb_agg",
        {
          kind: "union",
          value: [
            { kind: "array", value: { kind: "type", value: "number" } },
            { kind: "type", value: "null" },
          ],
        },
      ],
    ],
  });
});

test("select jsonb_agg(jsonb_build_object(const, const))", async () => {
  await testQuery({
    query: `SELECT jsonb_agg(jsonb_build_object('key', 'value'))`,
    expected: [
      [
        "jsonb_agg",
        {
          kind: "union",
          value: [
            {
              kind: "array",
              value: {
                kind: "object",
                value: [["key", { kind: "type", value: "string" }]],
              },
            },
            { kind: "type", value: "null" },
          ],
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
          kind: "union",
          value: [
            {
              kind: "array",
              value: { kind: "object", value: [["id", { kind: "type", value: "number" }]] },
            },
            { kind: "type", value: "null" },
          ],
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
          kind: "union",
          value: [
            {
              kind: "array",
              value: { kind: "object", value: [["id", { kind: "type", value: "number" }]] },
            },
            { kind: "type", value: "null" },
          ],
        },
      ],
    ],
  });
});

test("select jsonb_agg all use cases", async () => {
  await testQuery({
    query: `
    SELECT
      jsonb_agg(agency.*) col
    FROM agency
    `,
    expected: [
      [
        "col",
        {
          kind: "union",
          value: [
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
            { kind: "type", value: "null" },
          ],
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
          kind: "union",
          value: [
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
            { kind: "type", value: "null" },
          ],
        },
      ],
      [
        "jsonb_tbl_star",
        {
          kind: "union",
          value: [
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
            { kind: "type", value: "null" },
          ],
        },
      ],
      [
        "jsonb_tbl_col",
        {
          kind: "union",
          value: [
            { kind: "array", value: { kind: "type", value: "number" } },
            { kind: "type", value: "null" },
          ],
        },
      ],
      [
        "jsonb_object",
        {
          kind: "union",
          value: [
            {
              kind: "array",
              value: { kind: "object", value: [["firstName", { kind: "type", value: "string" }]] },
            },
            { kind: "type", value: "null" },
          ],
        },
      ],
    ],
  });
});

test("select jsonb_agg(tbl) from (subselect) tbl", async () => {
  await testQuery({
    query: `select jsonb_agg(tbl) from (select * from test_jsonb) tbl`,
    expected: [
      [
        "jsonb_agg",
        {
          kind: "union",
          value: [
            {
              kind: "array",
              value: {
                kind: "object",
                value: [
                  ["id", { kind: "type", value: "number" }],
                  [
                    "nullable_col",
                    {
                      kind: "union",
                      value: [
                        { kind: "type", value: "string" },
                        { kind: "type", value: "null" },
                      ],
                    },
                  ],
                ],
              },
            },
            { kind: "type", value: "null" },
          ],
        },
      ],
    ],
  });
});

test("select jsonb_agg(table with nullable column)", async () => {
  await testQuery({
    query: `select jsonb_agg(test_jsonb) FROM test_jsonb`,
    expected: [
      [
        "jsonb_agg",
        {
          kind: "union",
          value: [
            {
              kind: "array",
              value: {
                kind: "object",
                value: [
                  ["id", { kind: "type", value: "number" }],
                  [
                    "nullable_col",
                    {
                      kind: "union",
                      value: [
                        { kind: "type", value: "string" },
                        { kind: "type", value: "null" },
                      ],
                    },
                  ],
                ],
              },
            },
            { kind: "type", value: "null" },
          ],
        },
      ],
    ],
  });
});

test("select tbl with left join of self tbl", async () => {
  await testQuery({
    query: `
      SELECT
        caregiver.id as caregiver_id,
        self.id as self_id
      FROM caregiver
        LEFT JOIN caregiver self ON caregiver.id = self.id
    `,
    expected: [
      ["caregiver_id", { kind: "type", value: "number" }],
      [
        "self_id",
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

test("select union select", async () => {
  await testQuery({
    query: `SELECT 1 UNION SELECT 2`,
    expected: [["?column?", { kind: "type", value: "number" }]],
  });

  await testQuery({
    query: `SELECT 1 as a UNION SELECT 2 as b`,
    expected: [["a", { kind: "type", value: "number" }]],
  });

  await testQuery({
    query: `SELECT 'Hello' UNION SELECT 7;`,
    expectedError: 'invalid input syntax for type integer: "Hello"',
  });
});

test("should distinguish between schema", async () => {
  await testQuery({
    query: `SELECT name FROM table1`,
    expected: [["name", { kind: "type", value: "number" }]],
  });

  await testQuery({
    query: `SELECT name FROM schema1.table1`,
    expected: [["name", { kind: "type", value: "string" }]],
  });

  await testQuery({
    query: `SELECT name FROM schema2.table1`,
    expected: [
      [
        "name",
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
