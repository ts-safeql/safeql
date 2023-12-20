import { InternalError, LibPgQueryAST } from "@ts-safeql/shared";
import assert from "assert";
import { taskEither } from "fp-ts";
import { flow, identity, pipe } from "fp-ts/function";
import parser from "libpg-query";
import { test } from "mocha";
import { JsonTarget, getJsonTargets } from "./get-json-target-types";
import { getResolvedStatementFromParseResult } from "./get-resolved-statement";

const cases: {
  query: string;
  only?: boolean;
  expected: JsonTarget[];
}[] = [
  {
    query: `SELECT jsonb_build_object('key', 'value')`,
    expected: [
      {
        entries: [["key", { kind: "type", type: "text" }]],
        kind: "object",
        name: "jsonb_build_object",
      },
    ],
  },
  {
    query: `SELECT jsonb_agg(json_build_object('id', id)) FROM agency`,
    expected: [
      {
        kind: "array",
        name: "jsonb_agg",
        target: {
          entries: [["id", { kind: "column", column: "id", name: "id", table: "agency" }]],
          kind: "object",
          name: "jsonb_agg",
        },
      },
    ],
  },
  {
    query: `SELECT jsonb_build_object('id', (select 5))`,
    expected: [
      {
        entries: [["id", { kind: "unknown" }]],
        kind: "object",
        name: "jsonb_build_object",
      },
    ],
  },
  {
    query: `SELECT jsonb_build_object('deeply', jsonb_build_object('nested', 'object'))`,
    expected: [
      {
        entries: [
          [
            "deeply",
            {
              entries: [["nested", { kind: "type", type: "text" }]],
              kind: "object",
              name: "deeply",
            },
          ],
        ],
        kind: "object",
        name: "jsonb_build_object",
      },
    ],
  },
  {
    query: `SELECT json_build_object('id', agency.id) FROM agency`,
    expected: [
      {
        entries: [
          [
            "id",
            {
              column: "id",
              kind: "column",
              name: "id",
              table: "agency",
            },
          ],
        ],
        kind: "object",
        name: "json_build_object",
      },
    ],
  },
  {
    query: `SELECT json_build_object('id', 1::text::int)`,
    expected: [
      {
        entries: [
          [
            "id",
            {
              kind: "type-cast",
              name: "id",
              target: {
                kind: "type-cast",
                name: "id",
                target: {
                  kind: "type",
                  type: "int",
                },
                type: "text",
              },
              type: "int4",
            },
          ],
        ],
        kind: "object",
        name: "json_build_object",
      },
    ],
  },
  {
    query: `SELECT json_build_object('id', array[1,2,3])`,
    expected: [
      {
        entries: [
          [
            "id",
            {
              kind: "array",
              name: "id",
              target: {
                kind: "type",
                type: "int",
              },
            },
          ],
        ],
        kind: "object",
        name: "json_build_object",
      },
    ],
  },
  {
    query: `SELECT jsonb_agg(agency) FROM agency`,
    expected: [
      {
        kind: "array",
        name: "jsonb_agg",
        target: {
          kind: "table",
          name: "jsonb_agg",
          table: "agency",
        },
      },
    ],
  },
  {
    query: `SELECT json_agg(agency) as colname FROM agency`,
    expected: [
      {
        kind: "array",
        name: "colname",
        target: {
          kind: "table",
          name: "colname",
          table: "agency",
        },
      },
    ],
  },
  {
    query: `SELECT jsonb_agg(a) FROM agency a`,
    expected: [
      {
        kind: "array",
        name: "jsonb_agg",
        target: {
          kind: "table",
          name: "jsonb_agg",
          table: "agency",
        },
      },
    ],
  },
  {
    query: `SELECT jsonb_agg(a.id) FROM agency a`,
    expected: [
      {
        kind: "array",
        name: "jsonb_agg",
        target: {
          column: "id",
          kind: "column",
          name: "jsonb_agg",
          table: "agency",
        },
      },
    ],
  },
  {
    query: `SELECT jsonb_agg(a.id) FROM agency a`,
    expected: [
      {
        kind: "array",
        name: "jsonb_agg",
        target: {
          column: "id",
          kind: "column",
          name: "jsonb_agg",
          table: "agency",
        },
      },
    ],
  },
  {
    query: `SELECT jsonb_agg(jsonb_build_object('key', 'value'))`,
    expected: [
      {
        kind: "array",
        name: "jsonb_agg",
        target: {
          entries: [
            [
              "key",
              {
                kind: "type",
                type: "text",
              },
            ],
          ],
          kind: "object",
          name: "jsonb_agg",
        },
      },
    ],
  },
  {
    query: `SELECT jsonb_agg(json_build_object('id', agency.id)) FROM agency`,
    expected: [
      {
        kind: "array",
        name: "jsonb_agg",
        target: {
          entries: [
            [
              "id",
              {
                column: "id",
                kind: "column",
                name: "id",
                table: "agency",
              },
            ],
          ],
          kind: "object",
          name: "jsonb_agg",
        },
      },
    ],
  },
  {
    query: `
      SELECT
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
      {
        kind: "array",
        name: "jsonb_tbl",
        target: {
          kind: "table",
          name: "jsonb_tbl",
          table: "caregiver",
        },
      },
      {
        kind: "array",
        name: "jsonb_tbl_star",
        target: {
          kind: "table",
          name: "jsonb_tbl_star",
          table: "caregiver",
        },
      },
      {
        kind: "array",
        name: "jsonb_tbl_col",
        target: {
          column: "id",
          kind: "column",
          name: "jsonb_tbl_col",
          table: "caregiver",
        },
      },
      {
        kind: "array",
        name: "jsonb_object",
        target: {
          entries: [
            [
              "firstName",
              {
                column: "first_name",
                kind: "column",
                name: "firstName",
                table: "caregiver",
              },
            ],
          ],
          kind: "object",
          name: "jsonb_object",
        },
      },
    ],
  },
];

const typedParsedQuery = parser.parseQuery as (sql: string) => Promise<LibPgQueryAST.ParseResult>;

export const getTargetSourcesTE = flow(
  typedParsedQuery,
  taskEither.tryCatchK(identity, InternalError.to),
  taskEither.map((ast) => getJsonTargets(ast, getResolvedStatementFromParseResult(ast)))
);

for (const { query, expected, only } of cases) {
  const tester = only ? test.only : test;
  tester(`get json target types: ${query}`, async () => {
    return pipe(
      getTargetSourcesTE(query),
      taskEither.match(
        (error) => assert.fail(error.message),
        (result) => assert.deepEqual(result, expected)
      )
    )();
  });
}
