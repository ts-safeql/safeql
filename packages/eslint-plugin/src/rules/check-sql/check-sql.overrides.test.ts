import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

ruleTester.run("connection with overrides.types", checkSqlRule, {
  valid: [
    {
      name: 'with { int4: "Integer" }',
      options: withConnection(connections.withTag, {
        overrides: { types: { int4: "Integer" } },
      }),
      code: "sql<{ id: Integer }>`select id from member`",
    },
    {
      name: 'with default mapping for "date"',
      options: withConnection(connections.withTag),
      code: `
          const date = new Date();
          sql<{ id: number }>\`select id from test_date_column WHERE date_col = \${date}\`
        `,
    },
    {
      name: 'with { date: "LocalDate" }',
      options: withConnection(connections.withTag, {
        overrides: { types: { date: "LocalDate" } },
      }),
      code: `
          class LocalDate {}
          const date = new LocalDate();
          sql<{ id: number }>\`select id from test_date_column WHERE date_col = \${date}\`
        `,
    },
    {
      name: 'with { date: { parameter: "+(Parameter<LocalDate>|LocalDate)", return: "LocalDate" } }',
      options: withConnection(connections.withTag, {
        overrides: {
          types: {
            date: { parameter: "+(Parameter<LocalDate>|LocalDate)", return: "LocalDate" },
          },
        },
      }),
      code: `
          interface Parameter<T> { value: T; }
          class LocalDate {}
          function run(simple: LocalDate, parameterized: Parameter<LocalDate>) {
            sql<{ date_col: LocalDate }>\`select date_col from test_date_column WHERE date_col = \${parameterized}\`
          }
        `,
    },
    {
      name: 'with { date: { parameter: { regex: "(LocalDate|Parameter<LocalDate>)" }, return: "LocalDate" } }',
      options: withConnection(connections.withTag, {
        overrides: {
          types: {
            date: {
              parameter: { regex: "(LocalDate|Parameter<LocalDate>)" },
              return: "LocalDate",
            },
          },
        },
      }),
      code: `
          interface Parameter<T> { value: T; }
          class LocalDate {}
          function run(simple: LocalDate, parameterized: Parameter<LocalDate>) {
            sql<{ date_col: LocalDate }>\`select date_col from test_date_column WHERE date_col = \${simple}\`
            sql<{ date_col: LocalDate }>\`select date_col from test_date_column WHERE date_col = \${parameterized}\`
          }
        `,
    },
    {
      name: 'with custom type { role: "Role" }',
      options: withConnection(connections.withTag, {
        overrides: { types: { role: "Role" } },
      }),
      code: "sql<{ role: Role }>`select role from member`",
    },
    {
      name: 'with custom derived type { role: "Role" }',
      options: withConnection(connections.withTag, {
        overrides: { types: { role: "Role" } },
      }),
      code: `
          const roles = ["owner", "admin", "editor", "contributor", "viewer", "guest"] as const;
          type Role = typeof roles[number];
          sql<{ role: Role; }>\`select role from member\`
        `,
    },
    {
      name: 'with custom domain type { email: "Email" }',
      options: withConnection(connections.withTag, {
        overrides: { types: { email: "Email" } },
      }),
      code: "sql<{ email: Email }>`select email from member_email`",
    },
    {
      name: "select case when then jsonb with not like with type reference",
      options: withConnection(connections.withTag, {
        targets: [{ tag: "sql", transform: "{type}[]" }],
      }),
      code: `
          type Meta = { is_test: boolean; };
          type Member = { meta: Meta | null };

           await sql<Member[]>\`
             SELECT
               CASE WHEN member.id IS NOT NULL
                 THEN jsonb_build_object('is_test', member.first_name LIKE '%test%')
                 ELSE NULL
               END AS meta
             FROM
               member
           \`;
         `,
    },
    {
      name: 'insert with custom type { timestamptz: "Instant" }',
      options: withConnection(connections.withTag, {
        overrides: { types: { timestamptz: "Instant" } },
      }),
      code: `
          class Instant {}
          function foo(instant: Instant | null) {
            sql<{ colname: Instant | null }>\`
              INSERT INTO test_nullable_timestamptz (colname)
              VALUES (\${instant})
              RETURNING *
            \`
          }
         `,
    },
    {
      name: 'insert with custom type { timestamptz: "Instant" } - property access',
      options: withConnection(connections.withTag, {
        overrides: { types: { timestamptz: "Instant" } },
      }),
      code: `
          class Instant {}
          function foo(x: { instant: Instant | null }) {
            sql<{ colname: Instant | null }>\`
              INSERT INTO test_nullable_timestamptz (colname)
              VALUES (\${x.instant})
              RETURNING *
            \`
          }
         `,
    },
  ],
  invalid: [
    {
      name: 'with { int4: "Integer" } while { id: number }',
      options: withConnection(connections.withTag, {
        overrides: { types: { int4: "Integer" } },
      }),
      code: "sql<{ id: number }>`select id from member`",
      output: "sql<{ id: Integer }>`select id from member`",
      errors: [
        { messageId: "incorrectTypeAnnotations", line: 1, column: 5, endLine: 1, endColumn: 19 },
      ],
    },
    {
      name: 'comparing a col with `CustomDate` without { date: "CustomDate" }',
      options: withConnection(connections.withTag, {
        overrides: {},
      }),
      code: `
          class CustomDate {}
          const date = new CustomDate();
          sql<{ id: number }>\`select id from test_date_column WHERE date_col = \${date}\`
        `,
      errors: [{ messageId: "invalidQuery", line: 4, column: 82, endLine: 4, endColumn: 86 }],
    },
    {
      options: withConnection(connections.withGlobWrapper),
      name: "glob pattern should be checked as well (wrapper glob)",
      code: `
          class X {
            run() {
              conn.query(sql\`select 1 as num\`);
              conn.queryOne(sql\`select 1 as num\`);
              diff.query(sql\`select 1 as num\`);
            }
          }
        `,
      output: `
          class X {
            run() {
              conn.query<{ num: number }>(sql\`select 1 as num\`);
              conn.queryOne<{ num: number }>(sql\`select 1 as num\`);
              diff.query(sql\`select 1 as num\`);
            }
          }
        `,
      errors: [{ messageId: "missingTypeAnnotations" }, { messageId: "missingTypeAnnotations" }],
    },
    {
      options: withConnection(connections.withRegexWrapper),
      name: "regex pattern should be checked as well (wrapper regex)",
      code: `
          class X {
            run() {
              conn.query(sql\`select 1 as num\`);
              conn.queryOne(sql\`select 1 as num\`);
              conn.queryOneDiff(sql\`select 1 as num\`);
              diff.query(sql\`select 1 as num\`);
            }
          }
        `,
      output: `
          class X {
            run() {
              conn.query<{ num: number }>(sql\`select 1 as num\`);
              conn.queryOne<{ num: number }>(sql\`select 1 as num\`);
              conn.queryOneDiff(sql\`select 1 as num\`);
              diff.query(sql\`select 1 as num\`);
            }
          }
        `,
      errors: [{ messageId: "missingTypeAnnotations" }, { messageId: "missingTypeAnnotations" }],
    },
    {
      options: withConnection(connections.withMaxDepthOf(2)),
      name: "maxDepth should check spread and array arguments",
      code: `
          conn.query(...sql\`select 1 as num\`);
          conn.query([sql\`select 1 as num\`]);
          conn.query([...sql\`select 1 as num\`]);
          conn.query(...[...sql\`select 1 as num\`]);
        `,
      output: `
          conn.query<{ num: number }>(...sql\`select 1 as num\`);
          conn.query<{ num: number }>([sql\`select 1 as num\`]);
          conn.query<{ num: number }>([...sql\`select 1 as num\`]);
          conn.query(...[...sql\`select 1 as num\`]);
        `,
      errors: [
        { messageId: "missingTypeAnnotations" },
        { messageId: "missingTypeAnnotations" },
        { messageId: "missingTypeAnnotations" },
      ],
    },
    {
      options: withConnection(connections.withGlobTag),
      name: "glob pattern should be checked as well (tag glob)",
      code: `
          class X {
            run() {
              conn1.sql\`select 1 as num\`;
              conn2.sql\`select 1 as num\`;
              conn3.sql\`select 1 as num\`;
            }
          }
        `,
      output: `
          class X {
            run() {
              conn1.sql<{ num: number }>\`select 1 as num\`;
              conn2.sql<{ num: number }>\`select 1 as num\`;
              conn3.sql\`select 1 as num\`;
            }
          }
        `,
      errors: [{ messageId: "missingTypeAnnotations" }, { messageId: "missingTypeAnnotations" }],
    },
    {
      options: withConnection(connections.withRegexTag),
      name: "regex pattern should be checked as well (tag regex)",
      code: `
          class X {
            run() {
              conn1.sql\`select 1 as num\`;
              conn2.sql\`select 1 as num\`;
              conn3.sql\`select 1 as num\`;
            }
          }
        `,
      output: `
          class X {
            run() {
              conn1.sql<{ num: number }>\`select 1 as num\`;
              conn2.sql<{ num: number }>\`select 1 as num\`;
              conn3.sql\`select 1 as num\`;
            }
          }
        `,
      errors: [{ messageId: "missingTypeAnnotations" }, { messageId: "missingTypeAnnotations" }],
    },
    {
      options: withConnection(connections.withMemberTag),
      name: "[x].sql should be checked as well (as member expression)",
      code: `
          class X {
            run() { const result = Db.sql\`select 1 as num\` }
          }
        `,
      output: `
          class X {
            run() { const result = Db.sql<{ num: number }>\`select 1 as num\` }
          }
        `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      options: withConnection(connections.withTag),
      name: "this.[identifier] should be checked as well (as this expression)",
      code: `
          class X {
            run() { const result = this.sql\`select 1 as num\` }
          }
        `,
      output: `
          class X {
            run() { const result = this.sql<{ num: number }>\`select 1 as num\` }
          }
        `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
  ],
});

ruleTester.run("connection with overrides.columns", checkSqlRule, {
  valid: [
    {
      options: withConnection(connections.withTag, {
        overrides: {
          columns: {
            "test_override_column_type.jsonb_col": "JsonbColType",
            "test_override_column_type.jsonb_col_nullable": "JsonbColType",
          },
        },
      }),
      name: "overriden-column: valid type annotation",
      code: `
          type JsonbColType = { foo: string; };

          sql<{
            jsonb_col: JsonbColType;
            jsonb_col_nullable: JsonbColType | null;
            jsonb_col_not_overriden: any | null
          }>\`
            select
              jsonb_col,
              jsonb_col_nullable,
              jsonb_col_not_overriden
            from
              test_override_column_type
          \`
        `,
    },
    {
      options: withConnection(connections.withTag, {
        overrides: {
          columns: {
            "test_override_column_type.jsonb_col": "Entry[]",
            "test_override_column_type.jsonb_col_nullable": "Entry[]",
          },
        },
      }),
      name: "overriden-column: recursive type",
      code: `
          interface Text { type: 'entry'; name: string; }
          interface Group { type: 'group'; entries: Entry[]; }
          type Entry = Text | Group;

          sql<{
            jsonb_col: Entry[],
            jsonb_col_nullable: Entry[] | null,
            with_fallback: Entry[],
          }>\`
            select
              jsonb_col,
              jsonb_col_nullable,
              coalesce(jsonb_col_nullable, '[]'::jsonb) with_fallback
            from test_override_column_type
          \`
        `,
    },
  ],
  invalid: [
    {
      options: withConnection(connections.withTag, {
        overrides: {
          columns: {
            "test_override_column_type.jsonb_col": "JsonbColType",
            "test_override_column_type.jsonb_col_nullable": "JsonbColType",
          },
        },
      }),
      name: "overriden-column: invalid missing type annotation",
      code: `
          type JsonbColType = { foo: string; };

          sql\`
            select
              jsonb_col,
              jsonb_col_nullable,
              jsonb_col_not_overriden
            from
              test_override_column_type
          \`
        `,
      output: `
          type JsonbColType = { foo: string; };

          sql<{ jsonb_col: JsonbColType; jsonb_col_nullable: JsonbColType | null; jsonb_col_not_overriden: any | null }>\`
            select
              jsonb_col,
              jsonb_col_nullable,
              jsonb_col_not_overriden
            from
              test_override_column_type
          \`
        `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      options: withConnection(connections.withTag, {
        overrides: {
          columns: {
            "invalid-config": "JsonbColType",
          },
        },
      }),
      name: "overriden-column: invalid configuration",
      code: "sql`select 1`",
      errors: [
        {
          messageId: "error",
          data: {
            error:
              "Internal error: Invalid override column key: invalid-config. Expected format: table.column",
          },
        },
      ],
    },
    {
      options: withConnection(connections.withTag, {
        overrides: {
          columns: {
            "test_override_column_type.jsonb_col": "Entry[]",
          },
        },
      }),
      name: "overriden-column: recursive type (missing type annotations)",
      code: `
          interface Text { type: 'entry'; name: string; }
          interface Group { type: 'group'; entries: Entry[]; }
          type Entry = Text | Group;

          sql\`select jsonb_col from test_override_column_type\`
        `,
      output: `
          interface Text { type: 'entry'; name: string; }
          interface Group { type: 'group'; entries: Entry[]; }
          type Entry = Text | Group;

          sql<{ jsonb_col: Entry[] }>\`select jsonb_col from test_override_column_type\`
        `,
      errors: [
        {
          messageId: "missingTypeAnnotations",
          data: {
            fix: "{ jsonb_col: Entry[] }",
          },
        },
      ],
    },
  ],
});
