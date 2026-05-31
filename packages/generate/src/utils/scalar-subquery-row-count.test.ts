import parser from "libpg-query";
import { test, expect } from "vitest";
import { selectReturnsExactlyOneRow } from "./scalar-subquery-row-count";

const aggregates = new Set(["count", "sum", "max", "min", "avg", "array_agg"]);

async function parseSelect(query: string) {
  const parsed = await parser.parse(query);
  const select = parsed.stmts[0]?.stmt?.SelectStmt;

  if (select === undefined) {
    throw new Error(`Expected select: ${query}`);
  }

  return select;
}

test("aggregate without GROUP BY always returns one row", async () => {
  expect(
    selectReturnsExactlyOneRow(
      await parseSelect("SELECT count(*) FROM member WHERE false"),
      aggregates,
    ),
  ).toBe(true);
});

test("aggregate with GROUP BY may return zero rows", async () => {
  expect(
    selectReturnsExactlyOneRow(
      await parseSelect("SELECT count(*) FROM member GROUP BY id"),
      aggregates,
    ),
  ).toBe(false);
});

test("aggregate with LIMIT 0 returns zero rows", async () => {
  expect(
    selectReturnsExactlyOneRow(
      await parseSelect("SELECT count(*)::int FROM member LIMIT 0"),
      aggregates,
    ),
  ).toBe(false);
});

test("aggregate with positive LIMIT still returns one row", async () => {
  expect(
    selectReturnsExactlyOneRow(
      await parseSelect("SELECT count(*)::int FROM member LIMIT 1"),
      aggregates,
    ),
  ).toBe(true);
});

test("constant without FROM returns one row", async () => {
  expect(selectReturnsExactlyOneRow(await parseSelect("SELECT 1"), aggregates)).toBe(true);
});

test("constant with FROM may return zero rows", async () => {
  expect(
    selectReturnsExactlyOneRow(await parseSelect("SELECT 1 FROM member WHERE false"), aggregates),
  ).toBe(false);
});

test("CASE without ELSE is not guaranteed one row", async () => {
  expect(
    selectReturnsExactlyOneRow(await parseSelect("SELECT CASE WHEN false THEN 1 END"), aggregates),
  ).toBe(false);
});
