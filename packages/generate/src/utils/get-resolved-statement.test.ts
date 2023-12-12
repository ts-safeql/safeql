import { InternalError, LibPgQueryAST } from "@ts-safeql/shared";
import { RecursiveOmit, deepOmit } from "@ts-safeql/test-utils";
import assert from "assert";
import { taskEither } from "fp-ts";
import { flow, identity, pipe } from "fp-ts/function";
import parser from "libpg-query";
import { test } from "mocha";
import { TargetOrigin, getResolvedStatementFromParseResult } from "./get-resolved-statement";

const cases: {
  query: string;
  only?: boolean;
  expected: RecursiveOmit<TargetOrigin, "node">[];
}[] = [
  {
    query: `SELECT * FROM caregiver`,
    expected: [{ kind: "table-star", table: { alias: undefined, name: "caregiver" } }],
  },
  {
    query: `SELECT * FROM caregiver as c`,
    expected: [
      {
        kind: "table-star",
        table: { name: "caregiver", alias: "c" },
      },
    ],
  },
  {
    query: `
      SELECT caregiver.*
      FROM caregiver
        JOIN caregiver_agency_assoc assoc ON assoc.caregiver_id = caregiver.id
    `,
    expected: [
      {
        kind: "table-star",
        table: { name: "caregiver", alias: undefined },
      },
    ],
  },
  {
    query: `
      SELECT *
      FROM caregiver
        JOIN caregiver_agency_assoc assoc ON assoc.caregiver_id = caregiver.id
    `,
    expected: [
      {
        kind: "star",
        tables: [
          { name: "caregiver", alias: undefined },
          { name: "caregiver_agency_assoc", alias: "assoc" },
        ],
      },
    ],
  },
  {
    query: `SELECT caregiver.id FROM caregiver`,
    expected: [
      {
        kind: "column",
        table: { name: "caregiver", alias: undefined },
        column: "id",
      },
    ],
  },
  {
    query: `SELECT c.id FROM caregiver as c`,
    expected: [
      {
        kind: "column",
        table: { name: "caregiver", alias: "c" },
        column: "id",
      },
    ],
  },
  {
    query: `SELECT id FROM caregiver`,
    expected: [
      {
        kind: "column",
        table: { name: "caregiver", alias: undefined },
        column: "id",
      },
    ],
  },
  {
    query: `SELECT caregiver.name FROM caregiver, agency`,
    expected: [
      {
        kind: "column",
        table: { name: "caregiver", alias: undefined },
        column: "name",
      },
    ],
  },
  {
    query: `
      SELECT c.name, a.location
      FROM caregiver as c
      JOIN agency as a ON c.agency_id = a.id
    `,
    expected: [
      {
        kind: "column",
        table: { name: "caregiver", alias: "c" },
        column: "name",
      },
      {
        kind: "column",
        table: { name: "agency", alias: "a" },
        column: "location",
      },
    ],
  },
  {
    query: `SELECT id FROM caregiver, agency`,
    expected: [
      {
        kind: "arbitrary-column",
        tables: [
          { name: "caregiver", alias: undefined },
          { name: "agency", alias: undefined },
        ],
        column: "id",
      },
    ],
  },
  {
    query: `
      WITH x as (
          SELECT
              caregiver.id,
              first_name
          FROM
              caregiver
              JOIN caregiver_agency_assoc assoc ON assoc.caregiver_id = caregiver.id
          )
      SELECT x.*
      FROM x
    `,
    expected: [
      {
        kind: "column",
        table: { name: "caregiver", alias: undefined },
        column: "id",
      },
      {
        kind: "arbitrary-column",
        tables: [
          { name: "caregiver", alias: undefined },
          { name: "caregiver_agency_assoc", alias: "assoc" },
        ],
        column: "first_name",
      },
    ],
  },
  {
    query: `
      WITH x as (
          SELECT
              caregiver.id,
              first_name
          FROM
              caregiver
              JOIN caregiver_agency_assoc assoc ON assoc.caregiver_id = caregiver.id
          )
      SELECT *
      FROM x
    `,
    expected: [
      { kind: "column", table: { name: "caregiver", alias: undefined }, column: "id" },
      {
        kind: "arbitrary-column",
        tables: [
          { name: "caregiver", alias: undefined },
          { name: "caregiver_agency_assoc", alias: "assoc" },
        ],
        column: "first_name",
      },
    ],
  },
  {
    query: `SELECT * FROM (SELECT id FROM caregiver) c`,
    expected: [
      {
        column: "id",
        kind: "column",
        table: { alias: undefined, name: "caregiver" },
      },
    ],
  },
  {
    query: `SELECT json_build_object('id', agency.id::text) FROM agency`,
    expected: [
      {
        kind: "function-column",
        column: "json_build_object",
        targets: [
          {
            kind: "type-cast",
            target: {
              column: "id",
              kind: "column",
              table: { name: "agency", alias: undefined },
            },
            type: "text",
          },
        ],
      },
    ],
  },
  {
    query: `SELECT json_build_object('id', agency.id) FROM agency`,
    expected: [
      {
        kind: "function-column",
        column: "json_build_object",
        targets: [{ kind: "column", table: { name: "agency", alias: undefined }, column: "id" }],
      },
    ],
  },
  {
    query: `SELECT jsonb_agg(agency) FROM agency`,
    expected: [
      {
        kind: "function-column",
        column: "jsonb_agg",
        targets: [{ kind: "table", table: { name: "agency", alias: undefined } }],
      },
    ],
  },
  {
    query: `SELECT jsonb_agg(tbl.id) col FROM agency tbl`,
    expected: [
      {
        kind: "function-column",
        column: "col",
        targets: [{ kind: "column", table: { name: "agency", alias: "tbl" }, column: "id" }],
      },
    ],
  },
  {
    query: `SELECT jsonb_agg(agency) FROM agency, caregiver`,
    expected: [
      {
        kind: "function-column",
        column: "jsonb_agg",
        targets: [{ kind: "table", table: { name: "agency", alias: undefined } }],
      },
    ],
  },
  {
    query: `
      SELECT jsonb_build_object('deeply', jsonb_build_object('nested', agency.id))
      FROM agency
    `,
    expected: [
      {
        kind: "function-column",
        column: "jsonb_build_object",
        targets: [
          {
            kind: "function-column",
            column: "jsonb_build_object",
            targets: [
              { kind: "column", table: { name: "agency", alias: undefined }, column: "id" },
            ],
          },
        ],
      },
    ],
  },
];

const typedParsedQuery = parser.parseQuery as (sql: string) => Promise<LibPgQueryAST.ParseResult>;

export const getTargetSourcesTE = flow(
  typedParsedQuery,
  taskEither.tryCatchK(identity, InternalError.to),
  taskEither.map((x) => deepOmit(getResolvedStatementFromParseResult(x).origins, "node"))
);

for (const { query, expected, only } of cases) {
  const tester = only ? test.only : test;
  tester(`get resolved statement: ${query}`, async () => {
    return pipe(
      getTargetSourcesTE(query),
      taskEither.match(
        (error) => assert.fail(error.message),
        (result) => assert.deepEqual(result, expected)
      )
    )();
  });
}
