import { InternalError } from "@ts-safeql/shared";
import assert from "assert";
import { taskEither } from "fp-ts";
import { flow, identity, pipe } from "fp-ts/function";
import parser from "libpg-query";
import { test } from "mocha";
import { getNonNullableColumns } from "./get-nonnullable-columns";

const cases: {
  query: string;
  expected: boolean[];
}[] = [
  { query: `SELECT 1`, expected: [true] },
  { query: `SELECT 2 as x`, expected: [true] },
  { query: `SELECT true`, expected: [true] },
  { query: `SELECT count(1)`, expected: [true] },
  { query: `SELECT INTERVAL '1 day'`, expected: [true] },
  { query: `SELECT '1 day'::interval`, expected: [true] },

  { query: `SELECT null`, expected: [false] },
  { query: `SELECT tbl.col FROM tbl`, expected: [false] },
  { query: `SELECT sum(tbl.num) FROM tbl`, expected: [false] },
  { query: `SELECT sum(1)::int FROM tbl`, expected: [false] },
];

export const getNonNullableColumnsTE = flow(
  parser.parseQuery,
  taskEither.tryCatchK(identity, InternalError.to),
  taskEither.map(getNonNullableColumns)
);

for (const { query, expected } of cases) {
  test(`get non-nullable columns: ${query}`, async () => {
    return pipe(
      getNonNullableColumnsTE(query),
      taskEither.match(
        (error) => assert.fail(error.message),
        (result) => assert.deepEqual(result, expected)
      )
    )();
  });
}
