import { InternalError } from "@ts-safeql/shared";
import assert from "assert";
import { taskEither } from "fp-ts";
import { flow, identity, pipe } from "fp-ts/lib/function";
import parser from "libpg-query";
import { test } from "vitest";
import { getNonNullableColumns } from "./get-nonnullable-columns";

const cases: {
  query: string;
  expected: string[];
  only?: boolean;
}[] = [
  { query: `SELECT 1`, expected: ["?column?"] },
  { query: `SELECT 2 as x`, expected: ["x"] },
  { query: `SELECT true`, expected: ["bool"] },
  { query: `SELECT count(1)`, expected: ["count"] },
  { query: `SELECT INTERVAL '1 day'`, expected: ["interval"] },
  { query: `SELECT '1 day'::interval`, expected: ["interval"] },
  { query: `SELECT EXISTS(SELECT col FROM tbl WHERE false)`, expected: ["exists"] },
  { query: `SELECT NOT EXISTS(SELECT col FROM tbl WHERE false)`, expected: ["?column?"] },
  { query: `SELECT upper('hello')`, expected: ["upper"] },
  { query: `SELECT COUNT(*) OVER ()`, expected: ["count"] },
  { query: `SELECT row_number() over()`, expected: ["row_number"] },
  { query: `SELECT 5 WHERE (SELECT col FROM tbl) IS NULL`, expected: ["?column?"] },
  { query: `SELECT 'hello' || 'world'`, expected: ["?column?"] },
  { query: `SELECT 3 * 4`, expected: ["?column?"] },
  { query: `SELECT 10 / 2`, expected: ["?column?"] },
  { query: `SELECT 10 - 2`, expected: ["?column?"] },
  { query: `SELECT 10 + 2`, expected: ["?column?"] },
  { query: `SELECT CASE WHEN true THEN 1 ELSE 0 END`, expected: ["case"] },
  { query: `SELECT tbl.col FROM tbl WHERE tbl.col IS NOT NULL`, expected: ["tbl.col"] },
  { query: `SELECT tbl.col IS NOT NULL AS is_col_not_null`, expected: ["is_col_not_null"] },
  { query: `SELECT tbl.col IS NULL AS is_col_null`, expected: ["is_col_null"] },
  { query: `SELECT coalesce(tbl.col, 0) FROM tbl`, expected: ["coalesce"] },
  { query: `SELECT ARRAY[1, 2, 3]`, expected: ["array"] },
  { query: `SELECT ARRAY[1, 2, 3]::int[]`, expected: ["array"] },
  { query: `SELECT ARRAY[1, 2, 3]::int[] as x`, expected: ["x"] },
  { query: `SELECT ARRAY[1, null, 3]`, expected: ["array"] },
  { query: `SELECT ARRAY[null]`, expected: ["array"] },
  { query: `SELECT ARRAY(SELECT 1)`, expected: ["array"] },
  { query: `SELECT ARRAY(SELECT tbl.col FROM tbl WHERE tbl.col IS NOT NULL)`, expected: ["array"] },
  { query: `SELECT (SELECT 1 AS X)`, expected: ["x"] },
  { query: `SELECT a, b FROM tbl WHERE b IS NOT NULL`, expected: ["b"] },
  { query: `SELECT a, b FROM tbl WHERE b IS NOT NULL AND a IS NOT NULL`, expected: ["b", "a"] },
  {
    query: `SELECT a, b, c FROM tbl WHERE a IS NOT NULL AND (b IS NOT NULL OR c IS NOT NULL)`,
    expected: ["a"],
  },

  { query: `SELECT null`, expected: [] },
  { query: `SELECT tbl.col FROM tbl`, expected: [] },
  { query: `SELECT sum(tbl.num) FROM tbl`, expected: [] },
  { query: `SELECT sum(1)::int FROM tbl`, expected: [] },
  { query: `SELECT ALL(SELECT col FROM tbl)`, expected: [] },
  { query: `SELECT (SELECT col FROM tbl LIMIT 1)`, expected: [] },
  { query: `SELECT 10 + NULL`, expected: [] },
  { query: `SELECT max(tbl.num) FROM tbl`, expected: [] },
  { query: `SELECT min(tbl.num) FROM tbl`, expected: [] },
  { query: `SELECT avg(tbl.num) FROM tbl`, expected: [] },
  { query: `SELECT CASE WHEN true THEN NULL ELSE 0 END`, expected: [] },
  { query: `SELECT CASE WHEN true THEN 1 ELSE NULL END`, expected: [] },
  { query: `SELECT tbl.col FROM tbl WHERE tbl.col IS NULL`, expected: [] },
  { query: `SELECT coalesce(NULL, tbl.col) FROM tbl`, expected: [] },
  { query: `SELECT coalesce(tbl.col, NULL) FROM tbl`, expected: [] },
  { query: `SELECT NULLIF(tbl.col, 'value') FROM tbl`, expected: [] },
  { query: `SELECT NULLIF('value', tbl.col) FROM tbl`, expected: [] },
  { query: `SELECT GREATEST(1, NULL, 3)`, expected: [] },
  { query: `SELECT LEAST(1, NULL, 3)`, expected: [] },
  { query: `SELECT a, b FROM tbl WHERE b IS NOT NULL OR a IS NOT NULL`, expected: [] },
];

export const getNonNullableColumnsTE = flow(
  parser.parseQuery,
  taskEither.tryCatchK(identity, InternalError.to),
  taskEither.map(getNonNullableColumns),
  taskEither.map((set) => Array.from(set)),
);

for (const { query, expected, only } of cases) {
  const tester = only ? test.only : test;
  tester(`get non-nullable columns: ${query}`, async () => {
    return pipe(
      getNonNullableColumnsTE(query),
      taskEither.match(
        (error) => assert.fail(error.message),
        (result) => assert.deepEqual(result, expected),
      ),
    )();
  });
}
