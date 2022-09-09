import { InternalError } from "@ts-safeql/shared";
import assert from "assert";
import { taskEither } from "fp-ts";
import { flow, identity, pipe } from "fp-ts/lib/function";
import parser from "libpg-query";
import { test } from "mocha";
import { getLeftJoinTablesFromParsed } from "./getLeftJoinTables";

const cases = [
  {
    query: "SELECT * FROM caregiver",
    expected: [],
  },
  {
    query: "SELECT * FROM caregiver LEFT JOIN agency ON caregiver.id = agency.id",
    expected: ["agency"],
  },
  {
    query: `
        SELECT
            caregiver.id as caregiver_id,
            caregiver_agency.id as assoc_id
        FROM caregiver
            LEFT JOIN caregiver_agency ON caregiver.id = caregiver_agency.caregiver_id
            LEFT JOIN agency ON caregiver_agency.agency_id = agency.id
    `,
    expected: ["agency", "caregiver_agency"],
  },
];

export const getLeftJoinTablesTE = flow(
  parser.parseQuery,
  taskEither.tryCatchK(identity, InternalError.to),
  taskEither.map(getLeftJoinTablesFromParsed)
);

for (const { query, expected } of cases) {
  test(`getLeftJoinTables: ${query}`, async () => {
    return pipe(
      getLeftJoinTablesTE(query),
      taskEither.match(
        (error) => assert.fail(error.message),
        (result) => assert.deepEqual(result, expected)
      )
    )();
  });
}
