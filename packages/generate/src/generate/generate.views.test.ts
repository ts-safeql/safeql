import { test } from "vitest";
import { ResolvedTarget } from "../generate";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();

const int4: ResolvedTarget = { kind: "type", value: "number", type: "int4" };
const text: ResolvedTarget = { kind: "type", value: "string", type: "text" };
const nullable = (value: ResolvedTarget): ResolvedTarget => ({
  kind: "union",
  value: [value, { kind: "type", value: "null", type: "null" }],
});

test("select NOT NULL column from a view should be non-nullable", async () => {
  await testQuery({
    schema: `CREATE VIEW v_member AS SELECT id, first_name FROM member`,
    query: `SELECT id, first_name FROM v_member`,
    expected: [
      ["id", int4],
      ["first_name", text],
    ],
  });
});

test("select nullable column from a view should remain nullable", async () => {
  await testQuery({
    schema: `CREATE VIEW v_nullable AS SELECT nullable_col FROM test_nullability`,
    query: `SELECT nullable_col FROM v_nullable`,
    expected: [["nullable_col", nullable(text)]],
  });
});

test("select aliased NOT NULL column from a view should be non-nullable", async () => {
  await testQuery({
    schema: `CREATE VIEW v_member AS SELECT id AS member_id FROM member`,
    query: `SELECT member_id FROM v_member`,
    expected: [["member_id", int4]],
  });
});

test("view with an unaliased NOT NULL expression should keep its derived name non-nullable", async () => {
  await testQuery({
    schema: `CREATE VIEW v_count AS SELECT count(*) FROM member`,
    query: `SELECT count FROM v_count`,
    expected: [["count", { kind: "type", value: "string", type: "int8" }]],
  });
});

test("view with LEFT JOIN should keep the inner side non-null and outer side nullable", async () => {
  await testQuery({
    schema: `
      CREATE VIEW v_join AS
        SELECT m.id AS mid, mt.team_id AS tid
        FROM member m
        LEFT JOIN member_team mt ON mt.member_id = m.id
    `,
    query: `SELECT mid, tid FROM v_join`,
    expected: [
      ["mid", int4],
      ["tid", nullable(int4)],
    ],
  });
});

test("select NOT NULL column from a nested view (view on view) should be non-nullable", async () => {
  await testQuery({
    schema: `
      CREATE VIEW v_inner AS SELECT id FROM member;
      CREATE VIEW v_outer AS SELECT id FROM v_inner;
    `,
    query: `SELECT id FROM v_outer`,
    expected: [["id", int4]],
  });
});

test("select qualified NOT NULL column from a view should be non-nullable", async () => {
  await testQuery({
    schema: `CREATE VIEW v_member AS SELECT id, first_name FROM member`,
    query: `SELECT v.id, v.first_name FROM v_member v`,
    expected: [
      ["id", int4],
      ["first_name", text],
    ],
  });
});

test("select qualified aliased NOT NULL column from a view should be non-nullable", async () => {
  await testQuery({
    schema: `CREATE VIEW v_member AS SELECT id AS member_id FROM member`,
    query: `SELECT v.member_id FROM v_member v`,
    expected: [["member_id", int4]],
  });
});

test("select NOT NULL column from a materialized view should be non-nullable", async () => {
  await testQuery({
    schema: `CREATE MATERIALIZED VIEW mv_member AS SELECT id FROM member`,
    query: `SELECT id FROM mv_member`,
    expected: [["id", int4]],
  });
});

const int8 = { kind: "type", value: "string", type: "int8" } satisfies ResolvedTarget;

test("select a non-null function expression from a view should be non-nullable", async () => {
  await testQuery({
    schema: `CREATE VIEW v_count AS SELECT count(*) AS n FROM member`,
    query: `SELECT n FROM v_count`,
    expected: [["n", int8]],
  });
});

test("select a concatenation of NOT NULL columns from a view should be non-nullable", async () => {
  await testQuery({
    schema: `CREATE VIEW v_name AS SELECT first_name || last_name AS full_name FROM member`,
    query: `SELECT full_name FROM v_name`,
    expected: [["full_name", text]],
  });
});

test("select coalesce with a non-null fallback from a view should be non-nullable", async () => {
  await testQuery({
    schema: `CREATE VIEW v_coalesce AS SELECT coalesce(nullable_col, 'x') AS c FROM test_nullability`,
    query: `SELECT c FROM v_coalesce`,
    expected: [["c", text]],
  });
});

test("select a genuinely nullable expression from a view should remain nullable", async () => {
  await testQuery({
    schema: `CREATE VIEW v_maybe AS SELECT nullif(first_name, 'x') AS maybe FROM member`,
    query: `SELECT maybe FROM v_maybe`,
    expected: [["maybe", nullable(text)]],
  });
});

test("UNION view should be non-nullable when both branches are non-null", async () => {
  await testQuery({
    schema: `
      CREATE VIEW v_union AS
        SELECT id FROM member
        UNION
        SELECT team_id FROM member_team
    `,
    query: `SELECT id FROM v_union`,
    expected: [["id", int4]],
  });
});

test("UNION view should be nullable when one branch is nullable", async () => {
  await testQuery({
    schema: `
      CREATE VIEW v_union_mixed AS
        SELECT first_name FROM member
        UNION
        SELECT nullable_col FROM test_nullability
    `,
    query: `SELECT first_name FROM v_union_mixed`,
    expected: [["first_name", nullable(text)]],
  });
});

test("UNION view should infer non-null expression columns across branches", async () => {
  await testQuery({
    schema: `
      CREATE VIEW v_union_count AS
        SELECT count(*) AS n FROM member
        UNION ALL
        SELECT count(*) FROM member_team
    `,
    query: `SELECT n FROM v_union_count`,
    expected: [["n", int8]],
  });
});
