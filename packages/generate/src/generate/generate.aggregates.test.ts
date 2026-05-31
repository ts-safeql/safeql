import { test } from "vitest";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();

test("select array_agg(col order by col)", async () => {
  await testQuery({
    query: `SELECT array_agg(id ORDER BY id) col FROM team`,
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

test("select array_agg from union subquery", async () => {
  await testQuery({
    query: `
      SELECT
        array_agg(val) AS "values"
      FROM
        (
          SELECT 'a' AS "val"
          UNION
          SELECT 'b' AS "val" WHERE FALSE
        ) t1
    `,
    expected: [
      [
        "values",
        {
          kind: "union",
          value: [
            { kind: "array", value: { kind: "type", value: "string", type: "text" } },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("array_agg should not include unused CTE types", async () => {
  await testQuery({
    query: `
      WITH
        foo AS (
          SELECT 'a' AS val
          UNION
          SELECT 'b' AS val
        ),
        bar AS (
          SELECT 1 AS val
        )
      SELECT array_agg(val) AS values FROM foo
    `,
    expected: [
      [
        "values",
        {
          kind: "union",
          value: [
            { kind: "array", value: { kind: "type", value: "string", type: "text" } },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select coalesce(array_agg) from union subquery", async () => {
  await testQuery({
    query: `
      WITH
        data AS (
          SELECT
            array_agg(val) AS "values"
          FROM
            (
              SELECT 'a' AS "val"
              UNION
              SELECT 'b' AS "val" WHERE FALSE
            ) t1
        )
      SELECT
        coalesce(data.values, ARRAY[]::TEXT[]) AS "result"
      FROM
        data
    `,
    expected: [
      ["result", { kind: "array", value: { kind: "type", value: "string", type: "text" } }],
    ],
  });
});

test("select jsonb_agg(tbl)", async () => {
  await testQuery({
    query: `SELECT jsonb_agg(team) FROM team`,
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
    query: `SELECT coalesce(jsonb_agg(team), '[]'::jsonb) as col FROM team`,
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
    query: `SELECT json_agg(team) as colname FROM team`,
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
    query: `SELECT jsonb_agg(a) FROM team a`,
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
    query: `SELECT jsonb_agg(a.id) FROM team a`,
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
    query: `SELECT jsonb_agg(json_build_object('id', team.id)) FROM team`,
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
    query: `SELECT jsonb_agg(json_build_object('id', id)) FROM team`,
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
      jsonb_agg(team.*) col
    FROM team
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

test("select jsonb_agg all use cases (with joins and group by)", async () => {
  await testQuery({
    query: `
    SELECT
      team.id,
      jsonb_agg(c) as jsonb_tbl,
      jsonb_agg(c.*) as jsonb_tbl_star,
      jsonb_agg(c.id) as jsonb_tbl_col,
      jsonb_agg(json_build_object('firstName', c.first_name)) as jsonb_object
    FROM team
      JOIN member_team ON team.id = member_team.team_id
      JOIN member c ON c.id = member_team.member_id
    GROUP BY team.id
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
    expected: [["jsonb_agg", { kind: "type", type: "jsonb", value: "any" }]],
    unknownColumns: ["jsonb_agg"],
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
