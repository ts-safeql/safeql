import { normalizeIndent } from "@ts-safeql/shared";
import { describe, expect, it } from "vitest";
import { getQueryContext } from "./query-context";

describe("getQueryContext", () => {
  it("should handle queries with no keywords", () => {
    const query = "";

    expect(getQueryContext(query)).toMatchInlineSnapshot(`
      []
    `);
  });

  it("should parse queries with unusual capitalization", () => {
    const query = "SeLeCt * FrOm TBL WhErE ID = 10";

    expect(getQueryContext(query)).toMatchInlineSnapshot(`
      [
        "SELECT",
        "FROM",
        "WHERE",
      ]
    `);
  });

  it("should handle queries with comments", () => {
    const query = `
      SELECT id, name -- Select columns
      FROM people -- From table
      WHERE age > 30 /* age filter */
    `;

    expect(getQueryContext(query)).toMatchInlineSnapshot(`
      [
        "SELECT",
        "FROM",
        "WHERE",
      ]
    `);
  });

  it("should parse queries with UNION", () => {
    const query = normalizeIndent`
      SELECT name FROM tbl1
      UNION
      SELECT name FROM tbl2
      ORDER BY name
    `;

    expect(getQueryContext(query)).toMatchInlineSnapshot(`
      [
        "SELECT",
        "FROM",
        "UNION",
        "SELECT",
        "FROM",
        "ORDER BY",
      ]
    `);
  });

  it("should parse queries with JOINs", () => {
    const query = normalizeIndent`
      SELECT a.name, b.age
      FROM tbl1 a
      INNER JOIN tbl2 b ON a.id = b.id
      WHERE b.age > 30
    `;

    expect(getQueryContext(query)).toMatchInlineSnapshot(`
      [
        "SELECT",
        "FROM",
        "INNER JOIN",
        "ON",
        "WHERE",
      ]
    `);
  });

  it("should parse queries with nested functions", () => {
    const query = normalizeIndent`
      SELECT id, COUNT(*) AS total
      FROM (
        SELECT id FROM tbl WHERE col = 5
      ) subquery
      GROUP BY id
    `;

    expect(getQueryContext(query)).toMatchInlineSnapshot(`
      [
        "SELECT",
        "FROM",
        [
          "SELECT",
          "FROM",
          "WHERE",
        ],
        "GROUP BY",
      ]
    `);
  });

  it("should handle queries with placeholders", () => {
    const query = "SELECT * FROM tbl WHERE id = $1 AND name = $2";

    expect(getQueryContext(query)).toMatchInlineSnapshot(`
      [
        "SELECT",
        "FROM",
        "WHERE",
      ]
    `);
  });

  it("should parse queries with CASE statements", () => {
    const query = normalizeIndent`
      SELECT id,
             CASE WHEN col1 = 1 THEN 'A'
                  WHEN col2 = 2 THEN 'B'
                  ELSE 'C' END AS category
      FROM tbl
    `;

    expect(getQueryContext(query)).toMatchInlineSnapshot(`
      [
        "SELECT",
        "FROM",
      ]
    `);
  });

  it("should parse queries with window functions", () => {
    const query = normalizeIndent`
      SELECT id, ROW_NUMBER() OVER (PARTITION BY category ORDER BY created_at) AS row_num
      FROM tbl
    `;

    expect(getQueryContext(query)).toMatchInlineSnapshot(`
      [
        "SELECT",
        [
          "PARTITION BY",
          "ORDER BY",
        ],
        "FROM",
      ]
    `);
  });

  it("should parse queries with complex expressions in SELECT", () => {
    const query = "SELECT id, (col1 + col2) * col3 AS result FROM tbl";

    expect(getQueryContext(query)).toMatchInlineSnapshot(`
      [
        "SELECT",
        "FROM",
      ]
    `);
  });

  it("should parse queries with DISTINCT ON", () => {
    const query = "SELECT DISTINCT ON (col1) col1, col2 FROM tbl ORDER BY col1, col2";

    expect(getQueryContext(query)).toMatchInlineSnapshot(`
      [
        "SELECT",
        "ON",
        "FROM",
        "ORDER BY",
      ]
    `);
  });

  it("should parse queries with multiple WITH clauses", () => {
    const query = normalizeIndent`
      WITH cte1 AS (
        SELECT id FROM tbl1
      ),
      cte2 AS (
        SELECT id FROM tbl2
      )
      SELECT * FROM cte1
      INNER JOIN cte2 ON cte1.id = cte2.id
    `;

    expect(getQueryContext(query)).toMatchInlineSnapshot(`
      [
        "WITH",
        [
          "SELECT",
          "FROM",
        ],
        [
          "SELECT",
          "FROM",
        ],
        "SELECT",
        "FROM",
        "INNER JOIN",
        "ON",
      ]
    `);
  });
});
