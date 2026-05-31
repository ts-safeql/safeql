import { test } from "vitest";
import { setupGenerateTest } from "./generate.test-setup";

const testQuery = setupGenerateTest();

test("select with an inner join", async () => {
  await testQuery({
    query: `
        SELECT
            member.id as member_id,
            member_team.id as assoc_id
        FROM member
            JOIN member_team ON member.id = member_team.member_id
    `,
    expected: [
      ["member_id", { kind: "type", value: "number", type: "int4" }],
      ["assoc_id", { kind: "type", value: "number", type: "int4" }],
    ],
  });
});

test("select with an inner join without table reference", async () => {
  await testQuery({
    query: `
        SELECT team_id
        FROM member
            JOIN member_team ON member.id = member_team.member_id
    `,
    expected: [["team_id", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("select with left join should return all cols from left join as nullable", async () => {
  await testQuery({
    query: `
        SELECT
            member.id as member_id,
            member_team.id as assoc_id
        FROM member
            LEFT JOIN member_team ON member.id = member_team.member_id
    `,
    expected: [
      ["member_id", { kind: "type", value: "number", type: "int4" }],
      [
        "assoc_id",
        {
          kind: "union",
          value: [
            { kind: "type", value: "number", type: "int4" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select with right join should return all cols from the other table as nullable", async () => {
  await testQuery({
    query: `
        SELECT
            member.id as member_id,
            member_team.id as assoc_id
        FROM member
            RIGHT JOIN member_team ON member.id = member_team.member_id
    `,
    expected: [
      [
        "member_id",
        {
          kind: "union",
          value: [
            { kind: "type", value: "number", type: "int4" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
      ["assoc_id", { kind: "type", value: "number", type: "int4" }],
    ],
  });
});

test("select with full join should return all cols as nullable", async () => {
  await testQuery({
    query: `
        SELECT
            member.id as member_id,
            member_team.id as assoc_id
        FROM member
            FULL JOIN member_team ON member.id = member_team.member_id
    `,
    expected: [
      [
        "member_id",
        {
          kind: "union",
          value: [
            { kind: "type", value: "number", type: "int4" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
      [
        "assoc_id",
        {
          kind: "union",
          value: [
            { kind: "type", value: "number", type: "int4" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("select with duplicate columns should throw duplicate columns error", async () => {
  await testQuery({
    query: `
        SELECT
          member.id,
          member_team.id
        FROM member
            JOIN member_team ON member.id = member_team.member_id
    `,
    expectedError: "Duplicate columns: member.id, member_team.id",
  });
});

test("select tbl with left join of self tbl", async () => {
  await testQuery({
    query: `
      SELECT
        member.id as member_id,
        self.id as self_id
      FROM member
        LEFT JOIN member self ON member.id = self.id
    `,
    expected: [
      ["member_id", { kind: "type", value: "number", type: "int4" }],
      [
        "self_id",
        {
          kind: "union",
          value: [
            { kind: "type", value: "number", type: "int4" },
            { kind: "type", value: "null", type: "null" },
          ],
        },
      ],
    ],
  });
});

test("join inside join without an alias", async () => {
  await testQuery({
    query: `
      SELECT cc.member_id
      FROM member c
      LEFT JOIN (
        member_assignment cc
        INNER JOIN member_email cp
        ON cp.member_id = cc.member_id
      ) ON cc.member_id = c.id;
    `,
    expected: [["member_id", { kind: "type", value: "number", type: "int4" }]],
  });
});

test("join inside join without an alias (duplicate columns)", async () => {
  await testQuery({
    query: `
      SELECT *
      FROM member c
      LEFT JOIN (
        member_assignment cc
        INNER JOIN member_email cp
        ON cp.member_id = cc.member_id
      ) ON cc.member_id = c.id;
    `,
    expectedError: "Duplicate columns: member_assignment.member_id, member_email.member_id",
  });
});

test("should distinguish between schema", async () => {
  await testQuery({
    query: `SELECT name FROM table1`,
    expected: [["name", { kind: "type", value: "number", type: "int4" }]],
  });

  await testQuery({
    query: `SELECT name FROM schema1.table1`,
    expected: [["name", { kind: "type", value: "string", type: "text" }]],
  });

  await testQuery({
    query: `SELECT name FROM schema2.table1`,
    expected: [
      [
        "name",
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

test("select with duplicate columns and alias", async () => {
  await testQuery({
    query: `
      SELECT
        member.id as x,
        member_assignment.member_id as x
      FROM member
        JOIN member_assignment ON member.id = member_assignment.member_id
    `,
    expectedError: `Duplicate columns: member.id (alias: x), member_assignment.member_id (alias: x)`,
  });
});
