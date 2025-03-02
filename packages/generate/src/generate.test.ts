import { InternalError, normalizeIndent } from "@ts-safeql/shared";
import { generateTestDatabaseName, setupTestDatabase } from "@ts-safeql/test-utils";
import assert from "assert";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { flow, identity, pipe } from "fp-ts/lib/function";
import { parseQuery } from "libpg-query";
import { Sql } from "postgres";
import { afterAll, beforeAll, test } from "vitest";
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

    CREATE TABLE employee (
      id INT NOT NULL,
      data JSONB NOT NULL
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
        query: { text: query, sourcemaps: [] },
        cacheKey,
        fieldTransform: undefined,
        overrides: {
          columns: {
            "employee.data": "Data[]",
          },
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
    expected: [
      ["x", { kind: "literal", value: "1", base: { kind: "type", value: "number", type: "int4" } }],
    ],
  });
});

test("select columns", async () => {
  await testQuery({
    query: `SELECT id, first_name, last_name from caregiver LIMIT 1`,
    expected: [
      ["id", { kind: "type", value: "number", type: "int4" }],
      ["first_name", { kind: "type", value: "string", type: "text" }],
      ["last_name", { kind: "type", value: "string", type: "text" }],
    ],
  });
});

test("select all_types", async () => {
  await testQuery({
    query: `SELECT * FROM all_types`,
    expected: [
      ["id", { kind: "type", value: "number", type: "int4" }],
      ["text_column", { kind: "type", value: "string", type: "text" }],
      ["varchar_column", { kind: "type", value: "string", type: "varchar" }],
      ["char_column", { kind: "type", value: "string", type: "bpchar" }],
      ["int_column", { kind: "type", value: "number", type: "int4" }],
      ["smallint_column", { kind: "type", value: "number", type: "int2" }],
      ["bigint_column", { kind: "type", value: "string", type: "int8" }],
      ["decimal_column", { kind: "type", value: "string", type: "numeric" }],
      ["numeric_column", { kind: "type", value: "string", type: "numeric" }],
      ["real_column", { kind: "type", value: "number", type: "float4" }],
      ["double_column", { kind: "type", value: "number", type: "float8" }],
      ["serial_column", { kind: "type", value: "number", type: "int4" }],
      ["bigserial_column", { kind: "type", value: "string", type: "int8" }],
      ["boolean_column", { kind: "type", value: "boolean", type: "bool" }],
      ["date_column", { kind: "type", value: "Date", type: "date" }],
      ["time_column", { kind: "type", value: "string", type: "time" }],
      ["time_with_timezone_column", { kind: "type", value: "string", type: "timetz" }],
      ["timestamp_column", { kind: "type", value: "Date", type: "timestamp" }],
      ["timestamp_with_timezone_column", { kind: "type", value: "Date", type: "timestamptz" }],
      ["interval_column", { kind: "type", value: "string", type: "interval" }],
      ["uuid_column", { kind: "type", value: "string", type: "uuid" }],
      ["json_column", { kind: "type", value: "any", type: "json" }],
      ["jsonb_column", { kind: "type", value: "any", type: "jsonb" }],
      [
        "array_text_column",
        { kind: "array", value: { kind: "type", value: "string", type: "_text" } },
      ],
      [
        "array_int_column",
        { kind: "array", value: { kind: "type", value: "number", type: "_int4" } },
      ],
      ["bytea_column", { kind: "type", value: "any", type: "bytea" }],
      ["inet_column", { kind: "type", value: "string", type: "inet" }],
      ["cidr_column", { kind: "type", value: "string", type: "cidr" }],
      ["macaddr_column", { kind: "type", value: "string", type: "macaddr" }],
      ["macaddr8_column", { kind: "type", value: "string", type: "macaddr8" }],
      ["tsvector_column", { kind: "type", value: "unknown", type: "tsvector" }],
      ["tsquery_column", { kind: "type", value: "unknown", type: "tsquery" }],
      ["xml_column", { kind: "type", value: "unknown", type: "xml" }],
      ["point_column", { kind: "type", value: "unknown", type: "point" }],
      ["line_column", { kind: "type", value: "unknown", type: "line" }],
      ["lseg_column", { kind: "type", value: "unknown", type: "lseg" }],
      ["box_column", { kind: "type", value: "unknown", type: "box" }],
      ["path_column", { kind: "type", value: "unknown", type: "path" }],
      ["polygon_column", { kind: "type", value: "unknown", type: "polygon" }],
      ["circle_column", { kind: "type", value: "unknown", type: "circle" }],
      ["money_column", { kind: "type", value: "number", type: "money" }],
      ["bit_column", { kind: "type", value: "boolean", type: "bit" }],
      ["bit_varying_column", { kind: "type", value: "unknown", type: "varbit" }],
    ],
  });
});

test("select 0", async () => {
  await testQuery({
    query: `SELECT 0`,
    expected: [
      [
        "?column?",
        { kind: "literal", value: "0", base: { kind: "type", value: "number", type: "int4" } },
      ],
    ],
  });
});

test("camel case field transform", async () => {
  await testQuery({
    options: { fieldTransform: "camel" },
    query: `SELECT id, first_name, last_name from caregiver LIMIT 1`,
    expected: [
      ["id", { kind: "type", value: "number", type: "int4" }],
      ["firstName", { kind: "type", value: "string", type: "text" }],
      ["lastName", { kind: "type", value: "string", type: "text" }],
    ],
  });
});

test("select true", async () => {
  await testQuery({
    options: { fieldTransform: "camel" },
    query: `SELECT true`,
    expected: [
      [
        "?column?",
        { kind: "literal", value: "true", base: { kind: "type", value: "boolean", type: "bool" } },
      ],
    ],
  });
});

test("select count(1) should be non-nullable", async () => {
  await testQuery({
    query: `SELECT count(1)`,
    expected: [["count", { kind: "type", value: "string", type: "int8" }]],
  });
});

test("select count(1) as col should be non-nullable", async () => {
  await testQuery({
    query: `SELECT count(1) as col`,
    expected: [["col", { kind: "type", value: "string", type: "int8" }]],
  });
});

test("select count(1)::int as col should be non-nullable", async () => {
  await testQuery({
    query: `SELECT count(1)::int as col`,
    expected: [["col", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("SELECT id FROM caregiver tbl WHERE tbl.id IS NOT NULL", async () => {
  await testQuery({
    query: `SELECT id FROM caregiver tbl WHERE tbl.id IS NOT NULL`,
    expected: [["id", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("SELECT tbl.id FROM caregiver tbl WHERE tbl.id IS NOT NULL", async () => {
  await testQuery({
    query: `SELECT tbl.id FROM caregiver tbl WHERE tbl.id IS NOT NULL`,
    expected: [["id", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("select psa.pid from pg_stat_activity psa where psa.pid IS NOT NULL", async () => {
  await testQuery({
    query: `select psa.pid from pg_stat_activity psa where psa.pid IS NOT NULL`,
    expected: [["pid", { kind: "type", value: "number", type: "int4" }]],
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
            { kind: "type", value: "string", type: "int8" },
            { kind: "type", value: "null", type: "null" },
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
            { kind: "type", value: "number", type: "int4" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select column as camelCase", async () => {
  await testQuery({
    query: `SELECT first_name as "firstName" from caregiver LIMIT 1`,
    expected: [["firstName", { kind: "type", value: "string", type: "text" }]],
  });
});

test("select non-table column", async () =>
  await testQuery({
    query: `SELECT 1 as count`,
    expected: [
      [
        "count",
        { kind: "literal", value: "1", base: { kind: "type", value: "number", type: "int4" } },
      ],
    ],
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
      ["caregiver_id", { kind: "type", value: "number", type: "int4" }],
      ["assoc_id", { kind: "type", value: "number", type: "int4" }],
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
    expected: [["agency_id", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("select exists(subselect)", async () => {
  await testQuery({
    query: `SELECT EXISTS(SELECT 1 FROM caregiver)`,
    expected: [["exists", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("select overriden enum", async () => {
  await testQuery({
    query: `SELECT * FROM test_overriden_enum`,
    expected: [
      ["col", { kind: "type", value: "OverridenEnum", type: "overriden_enum" }],
      [
        "nullable_col",
        {
          kind: "union",
          value: [
            { kind: "type", value: "OverridenEnum", type: "overriden_enum" },
            { kind: "type", value: "null", type: "null" },
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
      ["col", { kind: "type", value: "OverridenDomain", type: "overriden_domain" }],
      [
        "nullable_col",
        {
          kind: "union",
          value: [
            { kind: "type", value: "OverridenDomain", type: "overriden_domain" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select now()", async () => {
  await testQuery({
    query: `SELECT now()`,
    expected: [["now", { kind: "type", value: "Date", type: "timestamptz" }]],
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
      ["caregiver_id", { kind: "type", value: "number", type: "int4" }],
      [
        "assoc_id",
        {
          kind: "union",
          value: [
            { kind: "type", value: "number", type: "int4" },
            { kind: "type", value: "null", type: "null" },
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
            { kind: "type", value: "number", type: "int4" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
      ["assoc_id", { kind: "type", value: "number", type: "int4" }],
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
            { kind: "type", value: "number", type: "int4" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
      [
        "assoc_id",
        {
          kind: "union",
          value: [
            { kind: "type", value: "number", type: "int4" },
            { kind: "type", value: "null", type: "null" },
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
    expected: [["id", { kind: "type", value: "number", type: "int4" }]],
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
    expected: [["id", { kind: "type", value: "number", type: "int4" }]],
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
      ["date_col", { kind: "type", value: "Date", type: "date" }],
      ["date_array", { kind: "array", value: { kind: "type", value: "Date", type: "_date" } }],
      [
        "instant_arr",
        { kind: "array", value: { kind: "type", value: "Date", type: "_timestamptz" } },
      ],
      ["time_arr", { kind: "array", value: { kind: "type", value: "string", type: "_time" } }],
      ["timetz_arr", { kind: "array", value: { kind: "type", value: "string", type: "_timetz" } }],
      [
        "local_date_time_arr",
        { kind: "array", value: { kind: "type", value: "Date", type: "_timestamp" } },
      ],
      [
        "nullable_date_arr",
        {
          kind: "union",
          value: [
            { kind: "array", value: { kind: "type", value: "Date", type: "_date" } },
            { kind: "type", value: "null", type: "null" },
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
            { kind: "type", value: "'HHA'", type: "certification" },
            { kind: "type", value: "'RN'", type: "certification" },
            { kind: "type", value: "'LPN'", type: "certification" },
            { kind: "type", value: "'CNA'", type: "certification" },
            { kind: "type", value: "'PCA'", type: "certification" },
            { kind: "type", value: "'OTHER'", type: "certification" },
          ],
        },
      ],
    ],
  });
});

test("select domain type", async () => {
  await testQuery({
    query: `SELECT phone_number from caregiver_phonenumber`,
    expected: [
      ["phone_number", { kind: "type", value: "string", type: "phone_number", base: "text" }],
    ],
  });
});

test("select from subselect with an alias", async () => {
  await testQuery({
    query: `
      SELECT subselect.id FROM (SELECT * FROM caregiver) AS subselect
    `,
    expected: [["id", { kind: "type", value: "number", type: "int4" }]],
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
            { kind: "type", value: "string", type: "text" },
            { kind: "type", value: "null", type: "null" },
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
    expected: [["nullable_col", { kind: "type", value: "string", type: "text" }]],
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
        {
          kind: "object",
          value: [
            [
              "key",
              {
                kind: "literal",
                value: "'value'",
                base: { kind: "type", value: "string", type: "text" },
              },
            ],
          ],
        },
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
            [
              "deeply",
              {
                kind: "object",
                value: [
                  [
                    "nested",
                    {
                      kind: "literal",
                      value: "'object'",
                      base: { kind: "type", value: "string", type: "text" },
                    },
                  ],
                ],
              },
            ],
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
      [
        "json_build_object",
        { kind: "object", value: [["id", { kind: "type", value: "number", type: "int4" }]] },
      ],
    ],
  });
});

test("select jsonb_build_object(const, columnref::text)", async () => {
  await testQuery({
    query: `SELECT json_build_object('id', agency.id::text) FROM agency`,
    expected: [
      [
        "json_build_object",
        { kind: "object", value: [["id", { kind: "type", value: "string", type: "text" }]] },
      ],
    ],
  });
});

test("select jsonb_build_object(const, const::text::int)", async () => {
  await testQuery({
    query: `SELECT json_build_object('id', 1::text::int)`,
    expected: [
      [
        "json_build_object",
        { kind: "object", value: [["id", { kind: "type", value: "number", type: "int4" }]] },
      ],
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
          value: [
            [
              "id",
              {
                kind: "array",
                value: {
                  kind: "union",
                  value: [
                    {
                      kind: "literal",
                      value: "1",
                      base: { kind: "type", value: "number", type: "int4" },
                    },
                    {
                      kind: "literal",
                      value: "2",
                      base: { kind: "type", value: "number", type: "int4" },
                    },
                    {
                      kind: "literal",
                      value: "3",
                      base: { kind: "type", value: "number", type: "int4" },
                    },
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
                    {
                      kind: "literal",
                      value: "1",
                      base: { kind: "type", value: "number", type: "int4" },
                    },
                    { kind: "type", value: "null", type: "null" },
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
            { kind: "array", value: { kind: "type", value: "number", type: "int4" } },
            { kind: "type", value: "null", type: "null" },
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
                  ["id", { kind: "type", value: "number", type: "int4" }],
                  ["name", { kind: "type", value: "string", type: "text" }],
                ],
              },
            },
            { kind: "type", value: "null", type: "null" },
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
              ["id", { kind: "type", value: "number", type: "int4" }],
              ["name", { kind: "type", value: "string", type: "text" }],
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
                  ["id", { kind: "type", value: "number", type: "int4" }],
                  ["name", { kind: "type", value: "string", type: "text" }],
                ],
              },
            },
            { kind: "type", value: "null", type: "null" },
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
                  ["id", { kind: "type", value: "number", type: "int4" }],
                  ["name", { kind: "type", value: "string", type: "text" }],
                ],
              },
            },
            { kind: "type", value: "null", type: "null" },
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
            { kind: "array", value: { kind: "type", value: "number", type: "int4" } },
            { kind: "type", value: "null", type: "null" },
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
                value: [
                  [
                    "key",
                    {
                      kind: "literal",
                      value: "'value'",
                      base: { kind: "type", value: "string", type: "text" },
                    },
                  ],
                ],
              },
            },
            { kind: "type", value: "null", type: "null" },
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
              value: {
                kind: "object",
                value: [["id", { kind: "type", value: "number", type: "int4" }]],
              },
            },
            { kind: "type", value: "null", type: "null" },
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
              value: {
                kind: "object",
                value: [["id", { kind: "type", value: "number", type: "int4" }]],
              },
            },
            { kind: "type", value: "null", type: "null" },
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
                  ["id", { kind: "type", value: "number", type: "int4" }],
                  ["name", { kind: "type", value: "string", type: "text" }],
                ],
              },
            },
            { kind: "type", value: "null", type: "null" },
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
      ["id", { kind: "type", value: "number", type: "int4" }],
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
                  ["id", { kind: "type", value: "number", type: "int4" }],
                  ["first_name", { kind: "type", value: "string", type: "text" }],
                  ["last_name", { kind: "type", value: "string", type: "text" }],
                ],
              },
            },
            { kind: "type", value: "null", type: "null" },
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
                  ["id", { kind: "type", value: "number", type: "int4" }],
                  ["first_name", { kind: "type", value: "string", type: "text" }],
                  ["last_name", { kind: "type", value: "string", type: "text" }],
                ],
              },
            },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
      [
        "jsonb_tbl_col",
        {
          kind: "union",
          value: [
            { kind: "array", value: { kind: "type", value: "number", type: "int4" } },
            { kind: "type", value: "null", type: "null" },
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
              value: {
                kind: "object",
                value: [["firstName", { kind: "type", value: "string", type: "text" }]],
              },
            },
            { kind: "type", value: "null", type: "null" },
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
                  ["id", { kind: "type", value: "number", type: "int4" }],
                  [
                    "nullable_col",
                    {
                      kind: "union",
                      value: [
                        { kind: "type", value: "string", type: "text" },
                        { kind: "type", value: "null", type: "null" },
                      ],
                    },
                  ],
                ],
              },
            },
            { kind: "type", value: "null", type: "null" },
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
                  ["id", { kind: "type", value: "number", type: "int4" }],
                  [
                    "nullable_col",
                    {
                      kind: "union",
                      value: [
                        { kind: "type", value: "string", type: "text" },
                        { kind: "type", value: "null", type: "null" },
                      ],
                    },
                  ],
                ],
              },
            },
            { kind: "type", value: "null", type: "null" },
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
      ["caregiver_id", { kind: "type", value: "number", type: "int4" }],
      [
        "self_id",
        {
          kind: "union",
          value: [
            { kind: "type", value: "number", type: "int4" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

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

test("select union select #3", async () => {
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

test("join inside join without an alias", async () => {
  await testQuery({
    query: `
      SELECT cc.caregiver_id
      FROM caregiver c
      LEFT JOIN (
        caregiver_certification cc
        INNER JOIN caregiver_phonenumber cp
        ON cp.caregiver_id = cc.caregiver_id
      ) ON cc.caregiver_id = c.id;
    `,
    expected: [["caregiver_id", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("join inside join without an alias (duplicate columns)", async () => {
  await testQuery({
    query: `
      SELECT *
      FROM caregiver c
      LEFT JOIN (
        caregiver_certification cc
        INNER JOIN caregiver_phonenumber cp
        ON cp.caregiver_id = cc.caregiver_id
      ) ON cc.caregiver_id = c.id;
    `,
    expectedError:
      "Duplicate columns: caregiver_certification.caregiver_id, caregiver_phonenumber.caregiver_id",
  });
});

test("should distinguish between schema", async () => {
  await testQuery({
    query: `SELECT name FROM table1`,
    expected: [["name", { kind: "type", value: "number", type: "int4" }]],
  });

  await testQuery({
    query: `SELECT name FROM schema1.table1`,
    expected: [["name", { kind: "type", value: "string", type: "text" }]],
  });

  await testQuery({
    query: `SELECT name FROM schema2.table1`,
    expected: [
      [
        "name",
        {
          kind: "union",
          value: [
            { kind: "type", value: "string", type: "text" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select with duplicate columns and alias", async () => {
  await testQuery({
    query: `
      SELECT
        caregiver.id as x,
        caregiver_certification.caregiver_id as x
      FROM caregiver
        JOIN caregiver_certification ON caregiver.id = caregiver_certification.caregiver_id
    `,
    expectedError: `Duplicate columns: caregiver.id (alias: x), caregiver_certification.caregiver_id (alias: x)`,
  });
});

test("select case when expr with returned string literals", async () => {
  await testQuery({
    query: `
      SELECT
        CASE
          WHEN id = 1 THEN 'one'
          WHEN id = 2 THEN 'two'
          ELSE 'other'
        END as name
      FROM caregiver
    `,
    expected: [
      [
        "name",
        {
          kind: "union",
          value: [
            {
              kind: "literal",
              value: "'one'",
              base: { kind: "type", value: "string", type: "text" },
            },
            {
              kind: "literal",
              value: "'two'",
              base: { kind: "type", value: "string", type: "text" },
            },
            {
              kind: "literal",
              value: "'other'",
              base: { kind: "type", value: "string", type: "text" },
            },
          ],
        },
      ],
    ],
  });

  await testQuery({
    query: `
      SELECT
        CASE
          WHEN id = 1 THEN 'one'
          WHEN id = 2 THEN 'two'
          ELSE NULL
        END as name
      FROM caregiver
      WHERE id = 1
    `,
    expected: [
      [
        "name",
        {
          kind: "union",
          value: [
            {
              kind: "literal",
              value: "'one'",
              base: { kind: "type", value: "string", type: "text" },
            },
            {
              kind: "literal",
              value: "'two'",
              base: { kind: "type", value: "string", type: "text" },
            },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });

  await testQuery({
    query: `
      SELECT
        CASE
          WHEN id = 1 THEN 'one'
          WHEN id = 2 THEN 'two'
        END as name
      FROM caregiver
      WHERE id = 1
    `,
    expected: [
      [
        "name",
        {
          kind: "union",
          value: [
            {
              kind: "literal",
              value: "'one'",
              base: { kind: "type", value: "string", type: "text" },
            },
            {
              kind: "literal",
              value: "'two'",
              base: { kind: "type", value: "string", type: "text" },
            },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });

  await testQuery({
    query: `SELECT CASE WHEN 1 = 1 THEN true ELSE false END`,
    expected: [["case", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("select case when expr is not null else is not null", async () => {
  await testQuery({
    query: `
      SELECT
        CASE WHEN TRUE
          THEN caregiver.id IS NOT NULL
          ELSE caregiver.id IS NOT NULL
        END
      FROM caregiver`,
    expected: [["case", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("select count(1) + count(1)", async () => {
  await testQuery({
    query: `SELECT count(1) + count(1)`,
    expected: [["?column?", { kind: "type", value: "string", type: "int8" }]],
  });
});

test("select count(1) + 1", async () => {
  await testQuery({
    query: `SELECT count(1) + 1`,
    expected: [["?column?", { kind: "type", value: "string", type: "int8" }]],
  });
});

test("select case when with jsonb_build_object", async () => {
  await testQuery({
    query: `
      SELECT
        CASE
          WHEN caregiver.id IS NOT NULL THEN (
            jsonb_build_object(
              'is_test',
              caregiver.first_name NOT LIKE '%test%'
            )
          )
          ELSE NULL
        END AS col
      FROM
        caregiver`,
    expected: [
      [
        "col",
        {
          kind: "union",
          value: [
            {
              kind: "object",
              value: [["is_test", { kind: "type", value: "boolean", type: "bool" }]],
            },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select case when with jsonb_build_object and left join", async () => {
  await testQuery({
    query: `
      SELECT
        CASE WHEN caregiver.id IS NOT NULL
        THEN jsonb_build_object('is_test', phonenumber.phone_number NOT LIKE '%212718%')
        ELSE NULL
      END AS col
      FROM caregiver
        JOIN caregiver_phonenumber phonenumber ON caregiver.id = phonenumber.caregiver_id
    `,
    expected: [
      [
        "col",
        {
          kind: "union",
          value: [
            {
              kind: "object",
              value: [["is_test", { kind: "type", type: "bool", value: "boolean" }]],
            },
            { kind: "type", type: "null", value: "null" },
          ],
        },
      ],
    ],
  });
});

test("1 + 2 => number", async () => {
  await testQuery({
    query: `SELECT 1 + 2`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("1 - 2 => number", async () => {
  await testQuery({
    query: `SELECT 1 - 2`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("2 * 3 => number", async () => {
  await testQuery({
    query: `SELECT 2 * 3`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("4 / 2 => number", async () => {
  await testQuery({
    query: `SELECT 4 / 2`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("5 % 2 => number", async () => {
  await testQuery({
    query: `SELECT 5 % 2`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("count(1) + count(1) => string", async () => {
  await testQuery({
    query: `SELECT count(1) + count(1)`,
    expected: [["?column?", { kind: "type", value: "string", type: "int8" }]],
  });
});

test("1 = 1 => boolean", async () => {
  await testQuery({
    query: `SELECT 1 = 1`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("1 != 2 => boolean", async () => {
  await testQuery({
    query: `SELECT 1 != 2`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("1 <> 2 => boolean", async () => {
  await testQuery({
    query: `SELECT 1 <> 2`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("1 < 2 => boolean", async () => {
  await testQuery({
    query: `SELECT 1 < 2`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("1 <= 2 => boolean", async () => {
  await testQuery({
    query: `SELECT 1 <= 2`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("1 > 2 => boolean", async () => {
  await testQuery({
    query: `SELECT 1 > 2`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("1 >= 2 => boolean", async () => {
  await testQuery({
    query: `SELECT 1 >= 2`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'foo' || 'bar' => string", async () => {
  await testQuery({
    query: `SELECT 'foo' || 'bar'`,
    expected: [["?column?", { kind: "type", value: "string", type: "text" }]],
  });
});

test("'foo' LIKE 'f%' => boolean", async () => {
  await testQuery({
    query: `SELECT 'foo' LIKE 'f%'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'foo' NOT LIKE 'f%' => boolean", async () => {
  await testQuery({
    query: `SELECT 'foo' NOT LIKE 'f%'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'foo' ILIKE 'F%' => boolean", async () => {
  await testQuery({
    query: `SELECT 'foo' ILIKE 'F%'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'foo' NOT ILIKE 'F%' => boolean", async () => {
  await testQuery({
    query: `SELECT 'foo' NOT ILIKE 'F%'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'foo' SIMILAR TO 'f.*' => boolean", async () => {
  await testQuery({
    query: `SELECT 'foo' SIMILAR TO 'f.*'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'foo' NOT SIMILAR TO 'f.*' => boolean", async () => {
  await testQuery({
    query: `SELECT 'foo' NOT SIMILAR TO 'f.*'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'foo' IS DISTINCT FROM 'bar' => boolean", async () => {
  await testQuery({
    query: `SELECT 'foo' IS DISTINCT FROM 'bar'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'foo' IS NOT DISTINCT FROM 'bar' => boolean", async () => {
  await testQuery({
    query: `SELECT 'foo' IS NOT DISTINCT FROM 'bar'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("true AND false => boolean", async () => {
  await testQuery({
    query: `SELECT true AND false`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("true OR false => boolean", async () => {
  await testQuery({
    query: `SELECT true OR false`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("5 & 3 => number", async () => {
  await testQuery({
    query: `SELECT 5 & 3`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("5 | 3 => number", async () => {
  await testQuery({
    query: `SELECT 5 | 3`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("5 # 3 => number (bitwise XOR)", async () => {
  await testQuery({
    query: `SELECT 5 # 3`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("1 << 2 => number (bitwise shift left)", async () => {
  await testQuery({
    query: `SELECT 1 << 2`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("4 >> 1 => number (bitwise shift right)", async () => {
  await testQuery({
    query: `SELECT 4 >> 1`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("~int => number", async () => {
  await testQuery({
    query: `SELECT ~5`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("1 + 2 => number", async () => {
  await testQuery({
    query: `SELECT 1 + 2`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("1 - 2 => number", async () => {
  await testQuery({
    query: `SELECT 1 - 2`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("2 * 3 => number", async () => {
  await testQuery({
    query: `SELECT 2 * 3`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("4 / 2 => number", async () => {
  await testQuery({
    query: `SELECT 4 / 2`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("5 % 2 => number", async () => {
  await testQuery({
    query: `SELECT 5 % 2`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("ARRAY[1, 2, 3] && ARRAY[3, 4, 5] => boolean", async () => {
  await testQuery({
    query: `SELECT ARRAY[1, 2, 3] && ARRAY[3, 4, 5]`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("ARRAY[1, 2, 3] @> ARRAY[2, 3] => boolean", async () => {
  await testQuery({
    query: `SELECT ARRAY[1, 2, 3] @> ARRAY[2, 3]`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("ARRAY[2, 3] <@ ARRAY[1, 2, 3] => boolean", async () => {
  await testQuery({
    query: `SELECT ARRAY[2, 3] <@ ARRAY[1, 2, 3]`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("ARRAY[1, 2] || ARRAY[3, 4] => array", async () => {
  await testQuery({
    query: `SELECT ARRAY[1, 2] || ARRAY[3, 4]`,
    expected: [["?column?", { kind: "type", value: "array", type: "array" }]],
  });
});

test("'{\"key\": \"value\"}'::jsonb ? 'key' => boolean", async () => {
  await testQuery({
    query: `SELECT '{"key": "value"}'::jsonb ? 'key'`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'{\"a\": 1, \"b\": 2}'::jsonb ?| array['a', 'c'] => boolean", async () => {
  await testQuery({
    query: `SELECT '{"a": 1, "b": 2}'::jsonb ?| array['a', 'c']`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'{\"a\": 1, \"b\": 2}'::jsonb ?& array['a', 'b'] => boolean", async () => {
  await testQuery({
    query: `SELECT '{"a": 1, "b": 2}'::jsonb ?& array['a', 'b']`,
    expected: [["?column?", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("'{\"a\": {\"b\": 1}}'::jsonb -> 'a' => jsonb", async () => {
  await testQuery({
    query: `SELECT '{"a": {"b": 1}}'::jsonb -> 'a'`,
    expected: [["?column?", { kind: "type", type: "jsonb", value: "any" }]],
  });
});

test("'{\"a\": {\"b\": 1}}'::jsonb ->> 'a' => string", async () => {
  await testQuery({
    query: `SELECT '{"a": {"b": 1}}'::jsonb ->> 'a'`,
    expected: [["?column?", { kind: "type", value: "string", type: "text" }]],
  });
});

test("'{\"a\": 1, \"b\": 2}'::jsonb #- '{a}' => jsonb", async () => {
  await testQuery({
    query: `SELECT '{"a": 1, "b": 2}'::jsonb #- '{a}'`,
    expected: [["?column?", { kind: "type", value: "any", type: "jsonb" }]],
  });
});

test("|/ 16 => number", async () => {
  await testQuery({
    query: `SELECT |/ 16`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("||/ 27 => number", async () => {
  await testQuery({
    query: `SELECT ||/ 27`,
    expected: [["?column?", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("2 ^ 3 => number", async () => {
  await testQuery({
    query: `SELECT 2 ^ 3`,
    expected: [["?column?", { kind: "type", value: "number", type: "float8" }]],
  });
});

test("select alias from subselect", async () => {
  await testQuery({
    query: `
      SELECT x.*
      FROM (
        SELECT caregiver.id IS NOT NULL AS test
        FROM caregiver
      ) x
    `,
    expected: [["test", { kind: "type", type: "int4", value: "number" }]],
  });
});

test("select cols from function range", async () => {
  await testQuery({
    query: `
      SELECT
        a.id,
        t.metadata IS NOT NULL AS "exists"
      FROM
        UNNEST(ARRAY[1, 2]) AS a(id)
        LEFT JOIN (
          VALUES (1, 'foo'), (2, null)
        ) AS t(id, metadata) ON t.id = a.id;
    `,
    expected: [
      [
        "id",
        {
          kind: "union",
          value: [
            { kind: "type", type: "int4", value: "number" },
            { kind: "type", type: "null", value: "null" },
          ],
        },
      ],
      ["exists", { kind: "type", type: "bool", value: "boolean" }],
    ],
    unknownColumns: ["id"], // TODO: `ast-get-source` needs to be refactored to handle this case
  });
});

test("select from cte with coalesce", async () => {
  await testQuery({
    query: `
      WITH t AS (select * from caregiver)
      SELECT coalesce(t.id) FROM t
    `,
    expected: [["coalesce", { kind: "type", type: "int4", value: "number" }]],
  });
});

test("multiple with statements that depend on each other", async () => {
  await testQuery({
    query: `
      WITH
        a AS (SELECT id from caregiver),
        b AS (SELECT a.* FROM a)
      SELECT * FROM b
    `,
    expected: [["id", { kind: "type", type: "int4", value: "number" }]],
    unknownColumns: ["id"],
  });
});

test("multiple subselects that depend on each other", async () => {
  await testQuery({
    query: `
      SELECT * FROM (
        SELECT * FROM (
          SELECT id FROM caregiver
        ) a
      ) b
    `,
    expected: [["id", { kind: "type", type: "int4", value: "number" }]],
  });
});

test("with select from inner join and left join", async () => {
  await testQuery({
    query: `
      WITH x AS (SELECT * FROM caregiver)
      SELECT x.id, agency.name, coalesce(agency.name, 'Unknown')
      FROM X
        INNER JOIN caregiver_agency ON x.id = caregiver_agency.caregiver_id
        LEFT JOIN agency ON caregiver_agency.agency_id = agency.id
    `,
    expected: [
      ["id", { kind: "type", type: "int4", value: "number" }],
      [
        "name",
        {
          kind: "union",
          value: [
            { kind: "type", type: "text", value: "string" },
            { kind: "type", type: "null", value: "null" },
          ],
        },
      ],
      ["coalesce", { kind: "type", type: "text", value: "string" }],
    ],
  });
});

test("select colref and const from left joined using col", async () => {
  await testQuery({
    query: `
      WITH cte AS (SELECT e.id AS id, 'value' AS value FROM employee AS e)
      SELECT cte.value, data
      FROM employee AS e
        LEFT JOIN cte USING (id);
    `,
    expected: [
      [
        "value",
        {
          kind: "union",
          value: [
            { kind: "type", value: "string", type: "text" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
      [
        "data",
        {
          kind: "type",
          type: "jsonb",
          value: "Data[]",
        },
      ],
    ],
    unknownColumns: ["value"] // TODO: `ast-get-source` needs to be refactored to handle this case
  });
});
