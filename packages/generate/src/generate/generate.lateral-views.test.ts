import { normalizeIndent } from "@ts-safeql/shared";
import { test } from "vitest";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();

test("select from LEFT JOIN LATERAL should return nullable field", async () => {
  await testQuery({
    schema: `
      CREATE TABLE parent_table (id INTEGER PRIMARY KEY);
      CREATE TABLE child_table (
        parent_id INTEGER REFERENCES parent_table(id),
        status BOOLEAN NOT NULL
      );
    `,
    query: `
      SELECT
        latest_child.status AS latest_status
      FROM
        parent_table
        LEFT JOIN LATERAL (
          SELECT child_table.status
          FROM child_table
          WHERE child_table.parent_id = parent_table.id
        ) latest_child ON TRUE
    `,
    expected: [
      [
        "latest_status",
        {
          kind: "union",
          value: [
            { kind: "type", value: "boolean", type: "bool" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select jsonb_build_object from LEFT JOIN LATERAL should return nullable object", async () => {
  await testQuery({
    schema: `
      CREATE TABLE invoice (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL);
      CREATE TABLE customer (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    `,
    query: `
      SELECT cust_json.snapshot
      FROM invoice inv
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('name', c.name) AS snapshot
        FROM customer c
        WHERE c.id = inv.customer_id
      ) cust_json ON TRUE
    `,
    expected: [
      [
        "snapshot",
        {
          kind: "union",
          value: [
            { kind: "object", value: [["name", { kind: "type", value: "string", type: "text" }]] },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select star from LEFT JOIN LATERAL should return nullable object", async () => {
  await testQuery({
    schema: `
      CREATE TABLE invoice (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL);
      CREATE TABLE customer (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    `,
    query: `
      SELECT cust_json.*
      FROM invoice inv
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('name', c.name) AS snapshot
        FROM customer c
        WHERE c.id = inv.customer_id
      ) cust_json ON TRUE
    `,
    expected: [
      [
        "snapshot",
        {
          kind: "union",
          value: [
            { kind: "object", value: [["name", { kind: "type", value: "string", type: "text" }]] },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select nullable column from LEFT JOIN LATERAL should return flat nullable type", async () => {
  await testQuery({
    schema: `
      CREATE TABLE invoice (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL);
      CREATE TABLE customer (id INTEGER PRIMARY KEY, nickname TEXT);
    `,
    query: `
      SELECT cust_json.snapshot
      FROM invoice inv
      LEFT JOIN LATERAL (
        SELECT c.nickname AS snapshot
        FROM customer c
        WHERE c.id = inv.customer_id
      ) cust_json ON TRUE
    `,
    expected: [
      [
        "snapshot",
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

test("select inner joined view column should remain non-nullable", async () => {
  await testQuery({
    schema: `CREATE VIEW visible_member AS SELECT id FROM member`,
    query: `
      SELECT visible_member.id AS member_id
      FROM member_team
        JOIN visible_member ON visible_member.id = member_team.member_id
    `,
    expected: [["member_id", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("select view column joined through left joined column should remain non-nullable", async () => {
  await testQuery({
    schema: `CREATE VIEW visible_member AS SELECT id FROM member`,
    query: `
      SELECT visible_member.id AS member_id
      FROM member
        LEFT JOIN member_team ON member_team.member_id = member.id
        JOIN visible_member ON visible_member.id = member_team.member_id
    `,
    expected: [["member_id", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("select inner joined view column inside subselect should remain non-nullable", async () => {
  await testQuery({
    schema: `CREATE VIEW visible_member AS SELECT id FROM member`,
    query: `
      SELECT subquery.member_id
      FROM (
        SELECT visible_member.id AS member_id
        FROM member_team
          JOIN visible_member ON visible_member.id = member_team.member_id
      ) subquery
    `,
    expected: [["member_id", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("select aliased inner joined view column from subselect should remain non-nullable", async () => {
  await testQuery({
    schema: `CREATE VIEW visible_member AS SELECT id FROM member`,
    query: `
      SELECT subquery.member_id AS cid
      FROM (
        SELECT visible_member.id AS member_id
        FROM member_team
          JOIN visible_member ON visible_member.id = member_team.member_id
      ) subquery
    `,
    expected: [["cid", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("select inner joined view column inside JOIN LATERAL should remain non-nullable", async () => {
  await testQuery({
    schema: `CREATE VIEW visible_member AS SELECT id FROM member`,
    query: `
      SELECT member_lookup.member_id
      FROM member_team
        JOIN LATERAL (
          SELECT visible_member.id AS member_id
          FROM visible_member
          WHERE visible_member.id = member_team.member_id
          LIMIT 1
        ) member_lookup ON TRUE
    `,
    expected: [["member_id", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("select jsonb_build_object from INNER JOIN LATERAL should return object", async () => {
  await testQuery({
    schema: `
      CREATE TABLE invoice (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL);
      CREATE TABLE customer (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    `,
    query: `
      SELECT cust_json.snapshot
      FROM invoice inv
      INNER JOIN LATERAL (
        SELECT jsonb_build_object('name', c.name) AS snapshot
        FROM customer c
        WHERE c.id = inv.customer_id
      ) cust_json ON TRUE
    `,
    expected: [
      [
        "snapshot",
        { kind: "object", value: [["name", { kind: "type", value: "string", type: "text" }]] },
      ],
    ],
  });
});

test("LEFT JOIN LATERAL with empty array constructor should infer nullable text array", async () => {
  await testQuery({
    query: normalizeIndent`
      SELECT
        member.id,
        incident_data.incidents AS incident_ids
      FROM member
      LEFT JOIN LATERAL (
        SELECT ARRAY[]::text[] AS incidents
      ) AS incident_data ON true
    `,
    expected: [
      ["id", { kind: "type", value: "number", type: "int4" }],
      [
        "incident_ids",
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
