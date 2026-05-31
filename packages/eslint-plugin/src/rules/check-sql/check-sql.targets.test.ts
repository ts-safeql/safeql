import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

ruleTester.run("base with transform", checkSqlRule, {
  valid: [
    {
      name: "transform: {type}[]",
      options: withConnection(connections.base, {
        targets: [{ wrapper: "conn.query", transform: "{type}[]" }],
      }),
      code: "const result = conn.query<{ id: number; }[]>(sql`select id from team`);",
    },
    {
      name: "transform: Array<{type}>",
      options: withConnection(connections.base, {
        targets: [{ wrapper: "conn.query", transform: "Array<{type}>" }],
      }),
      code: "const result = conn.query<Array<{ id: number; }>>(sql`select id from member`);",
    },
    {
      name: "transform: ['{type}[]']",
      options: withConnection(connections.base, {
        targets: [{ wrapper: "conn.query", transform: "{type}[]" }],
      }),
      code: "const result = conn.query<{ id: number; }[]>(sql`select id from member`);",
    },
    {
      name: "transform: [['middle_name', 'x_middle_name']]",
      options: withConnection(connections.base, {
        targets: [{ wrapper: "conn.query", transform: [["middle_name", "x_middle_name"]] }],
      }),
      code: "const result = conn.query<{ x_middle_name: string | null }>(sql`select middle_name from member`);",
    },
    {
      name: "transform: ['{type}[]', ['middle_name', 'x_middle_name']]",
      options: withConnection(connections.base, {
        targets: [
          { wrapper: "conn.query", transform: ["{type}[]", ["middle_name", "x_middle_name"]] },
        ],
      }),
      code: "const result = conn.query<{ x_middle_name: string | null; }[]>(sql`select middle_name from member`);",
    },
    {
      name: "transform: nested object (knex)",
      options: withConnection(connections.base, {
        targets: [{ tag: "knex.raw", transform: "{ rows: {type}[] }" }],
      }),
      code: "knex.raw<{ rows: { middle_name: string | null }[] }>(sql`select middle_name from member`)",
    },
  ],
  invalid: [
    {
      name: "transform: invalid nested object (knex)",
      options: withConnection(connections.base, {
        targets: [{ tag: "knex.raw", transform: "{ rows: {type}[] }" }],
      }),
      code: "knex.raw`select middle_name from member`",
      output:
        "knex.raw<{ rows: { middle_name: string | null }[] }>`select middle_name from member`",
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
  ],
});

ruleTester.run("connection with tag target", checkSqlRule, {
  valid: [
    {
      name: "tag as sql",
      options: withConnection(connections.withTag),
      code: "sql<{ id: number }>`select id from member`",
    },
    {
      name: "tag and transform as sql (Postgres.js)",
      options: withConnection(connections.withTag, {
        targets: [{ tag: "sql", transform: "{type}[]" }],
      }),
      code: "sql<{ id: number }[]>`select id from member`",
    },
    {
      name: "sql tag inside a function",
      options: withConnection(connections.withTag),
      code: "const result = conn.query(sql<{ id: number }>`select id from member`);",
    },
  ],
  invalid: [
    {
      name: "tag without type annotations",
      options: withConnection(connections.withTag),
      code: "sql`select id from member`",
      output: "sql<{ id: number }>`select id from member`",
      errors: [
        { messageId: "missingTypeAnnotations", line: 1, column: 1, endLine: 1, endColumn: 4 },
      ],
    },
    {
      name: "tag without type annotations inside a function",
      options: withConnection(connections.withTag),
      code: "const result = conn.query(sql`select id from member`)",
      output: "const result = conn.query(sql<{ id: number }>`select id from member`)",
      errors: [
        { messageId: "missingTypeAnnotations", line: 1, column: 27, endLine: 1, endColumn: 30 },
      ],
    },
  ],
});
