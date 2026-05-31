import { test } from "vitest";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();

test("select exists(subselect)", async () => {
  await testQuery({
    query: `SELECT EXISTS(SELECT 1 FROM member)`,
    expected: [["exists", { kind: "type", value: "boolean", type: "bool" }]],
  });
});

test("select from subselect with an alias", async () => {
  await testQuery({
    query: `SELECT subselect.id FROM (SELECT * FROM member) AS subselect`,
    expected: [["id", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("select from subselect with a join", async () => {
  await testQuery({
    query: `
    SELECT member.first_name
    FROM
      (SELECT 1 as id) as subselect1
        LEFT JOIN member ON subselect1.id = member.id
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

test("select alias from subselect", async () => {
  await testQuery({
    query: `
      SELECT x.*
      FROM (
        SELECT member.id IS NOT NULL AS test
        FROM member
      ) x
    `,
    expected: [["test", { kind: "type", type: "bool", value: "boolean" }]],
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
      WITH t AS (select * from member)
      SELECT coalesce(t.id) FROM t
    `,
    expected: [["coalesce", { kind: "type", type: "int4", value: "number" }]],
  });
});

test("multiple with statements that depend on each other", async () => {
  await testQuery({
    query: `
      WITH
        a AS (SELECT id from member),
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
          SELECT id FROM member
        ) a
      ) b
    `,
    unknownColumns: ["id"],
    expected: [["id", { kind: "type", type: "int4", value: "number" }]],
  });
});

test("with select from inner join and left join", async () => {
  await testQuery({
    query: `
      WITH x AS (SELECT * FROM member)
      SELECT x.id, team.name, coalesce(team.name, 'Unknown')
      FROM X
        INNER JOIN member_team ON x.id = member_team.member_id
        LEFT JOIN team ON member_team.team_id = team.id
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
          kind: "literal",
          value: "'value'",
          base: { kind: "type", value: "string", type: "text" },
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
  });
});

test("select col expr from subselect", async () => {
  await testQuery({
    schema: `
      CREATE TABLE tbl (id integer)
    `,
    query: `SELECT x.* FROM (SELECT tbl.id IS NOT NULL AS boolcol FROM tbl) x`,
    expected: [["boolcol", { kind: "type", type: "bool", value: "boolean" }]],
  });
});

test("select nullable case when as tbl.col from subselect", async () => {
  await testQuery({
    schema: `CREATE TABLE my_table (value TEXT NOT NULL)`,
    query: `
      SELECT sub.value
      FROM (
        SELECT CASE WHEN (1 = 1) THEN my_table.value ELSE NULL END AS value FROM my_table
      ) AS sub;
    `,
    expected: [
      [
        "value",
        {
          kind: "union",
          value: [
            { kind: "type", type: "text", value: "string" },
            { kind: "type", type: "null", value: "null" },
          ],
        },
      ],
    ],
  });
});

test("select case when as tbl.col from subselect", async () => {
  await testQuery({
    schema: `CREATE TABLE my_table (value TEXT NOT NULL, another_value TEXT NOT NULL)`,
    query: `
      SELECT sub.value
      FROM (
        SELECT CASE WHEN (1 = 1) THEN my_table.value ELSE my_table.another_value END AS value FROM my_table
      ) AS sub;
    `,
    expected: [["value", { kind: "type", type: "text", value: "string" }]],
  });
});

test("select case when as col from subselect", async () => {
  await testQuery({
    schema: `CREATE TABLE my_table (value TEXT NOT NULL, another_value TEXT NOT NULL)`,
    query: `
      SELECT value
      FROM (
        SELECT CASE WHEN (1 = 1) THEN my_table.value ELSE my_table.another_value END AS value FROM my_table
      ) AS sub;
    `,
    expected: [["value", { kind: "type", type: "text", value: "string" }]],
  });
});

test("select col.tbl from cte with array agg and col filter", async () => {
  await testQuery({
    schema: `CREATE TABLE my_table (col INTEGER NOT NULL);`,
    query: `
      WITH x as (
        SELECT
          array_agg(DISTINCT my_table.col) AS col1,
          array_agg(DISTINCT my_table.col) FILTER (WHERE my_table.col > 10) AS col2
        FROM my_table
      )
      SELECT
        x.col1,
        x.col2
      FROM x
    `,
    expected: [
      [
        "col1",
        {
          kind: "union",
          value: [
            {
              kind: "array",
              value: { kind: "type", type: "int4", value: "number" },
            },
            { kind: "type", type: "null", value: "null" },
          ],
        },
      ],
      [
        "col2",
        {
          kind: "union",
          value: [
            { kind: "array", value: { kind: "type", type: "int4", value: "number" } },
            { kind: "type", type: "null", value: "null" },
          ],
        },
      ],
    ],
  });
});
