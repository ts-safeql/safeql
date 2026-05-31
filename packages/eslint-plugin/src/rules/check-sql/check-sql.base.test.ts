import { normalizeIndent } from "@ts-safeql/shared";
import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

ruleTester.run("base", checkSqlRule, {
  valid: [
    {
      name: "select non-table column",
      options: withConnection(connections.base),
      code: "const result = conn.query<{ x: number }>(sql`SELECT 1 as x`);",
    },
    {
      name: "select array_agg(stmt)",
      options: withConnection(connections.withTag),
      code: "sql<{ ids: number[] | null }>`SELECT ARRAY_AGG(id ORDER BY id) AS ids FROM member`",
    },
    {
      name: "select exists(stmt)",
      options: withConnection(connections.withTag),
      code: "sql<{ exists: boolean }>`SELECT EXISTS(select id FROM member)`",
    },
    {
      name: "select not exists(stmt)",
      options: withConnection(connections.withTag),
      code: "sql<{ not_exists: boolean }>`SELECT NOT EXISTS(select id FROM member) as not_exists`",
    },
    {
      name: "select column from table",
      options: withConnection(connections.base),
      code: "const result = conn.query<{ id: number }>(sql`select id from member`);",
    },
    {
      name: "select * from table",
      options: withConnection(connections.base),
      code: `
          const result = conn.query<{ id: number; first_name: string; middle_name: string | null; last_name: string; role: 'owner' | 'admin' | 'editor' | 'contributor' | 'viewer' | 'guest'; created_at: Date }>(sql\`
              select * from member
          \`);
          `,
    },
    {
      name: "select enum from table",
      options: withConnection(connections.base),
      code: `
          const result = conn.query<{ role: 'owner' | 'admin' | 'editor' | 'contributor' | 'viewer' | 'guest' }>(sql\`
              select role from member
          \`);
        `,
    },
    {
      name: "compare typescript enum with postgres enum",
      options: withConnection(connections.withTag),
      code: `
          enum Role { owner = "owner", admin = "admin" }
          function foo(cert: Role) {
            sql\`select from member where role = \${cert}\`
          }
        `,
    },
    {
      name: "compare typescript enum property with postgres enum",
      options: withConnection(connections.withTag),
      code: `
          enum Role { owner = "owner", admin = "admin" }
          function foo() {
            sql\`select from member where role = \${Role.owner}\`
          }
        `,
    },
    {
      name: "compare typescript enum array with postgres enum array using ANY",
      options: withConnection(connections.withTag),
      code: `
          enum Role { owner = "owner", admin = "admin" }
          function foo(certs: Role[]) {
            sql\`select from member where role = ANY(\${certs}::role[])\`
          }
        `,
    },
    {
      name: "successfully selects an enum[] column",
      options: withConnection(connections.base, {
        overrides: { types: { role: "Role" } },
      }),
      code: `
          type Role = 'owner' | 'admin' | 'editor' | 'contributor' | 'viewer' | 'guest';
          const result = conn.query<{ roles: Role[] }>(sql\`select roles from test_enum_array\`);
        `,
    },
    {
      name: "successfully compares an enum[] column with an array of possibilities",
      options: withConnection(connections.withTag),
      code: `
          enum Role { owner = "owner", admin = "admin" }
          function foo(certs: Role[]) {
            sql\`select from test_enum_array where roles && \${certs}::role[]\`
          }
        `,
    },
    {
      name: "select from table with inner joins",
      options: withConnection(connections.base),
      code: `
            const result = conn.query<{ member_id: number; team_id: number }>(sql\`
                select
                    member.id as member_id,
                    team.id as team_id
                from member
                    join member_team on member.id = member_team.member_id
                    join team on team.id = member_team.team_id
            \`);
        `,
    },
    {
      name: "select from table with left join",
      options: withConnection(connections.base),
      code: `
            const result = conn.query<{ member_id: number; team_id: number | null }>(sql\`
                select
                    member.id as member_id,
                    team.id as team_id
                from member
                    left join member_team on member.id = member_team.member_id
                    left join team on team.id = member_team.team_id
            \`);
        `,
    },
    {
      name: "select from table where int column equals to ts number arg",
      options: withConnection(connections.base),
      code: `
            function run(id: number) {
                const result = conn.query<{ name: string }>(sql\`
                    select name from team where id = \${id}
                \`);
            }
        `,
    },
    {
      name: "select from table where int column in an array of ts arg",
      options: withConnection(connections.base),
      code: `
            function run(ids: number[]) {
                const result = conn.query<{ name: string }>(sql\`
                    select name from team where id = ANY(\${ids})
                \`);
            }
        `,
    },
    {
      name: "select with expression of (type | null)[]",
      options: withConnection(connections.base),
      code: `
            function run(ids: (number | null)[]) {
                const result = conn.query<{ name: string }>(sql\`
                    select name from team where id = ANY(\${ids})
                \`);
            }
        `,
    },
    {
      name: "select statement with conditional expression",
      options: withConnection(connections.base),
      code: `
            function run(flag: boolean) {
                const result = conn.query<{ name: string }>(sql\`
                    select name from team where id = \${flag ? 1 : 2}
                \`);
            }
        `,
    },
    {
      name: "select statement with conditional expression of ? x : null",
      options: withConnection(connections.base),
      code: `
          function run(flag: boolean) {
            const result = conn.query<{ col: string | null }>(sql\`
              select \${flag ? 'value' : null } as col
            \`);
          }
        `,
    },
    {
      name: "select statement with type reference",
      options: withConnection(connections.base),
      code: `
            type Team = { name: string };
            function run() {
                const result = conn.query<Team>(sql\`
                    select name from team
                \`);
            }
        `,
    },
    {
      name: "select statement with interface",
      options: withConnection(connections.base),
      code: `
            interface Team { name: string }
            function run() {
                const result = conn.query<Team>(sql\`
                    select name from team
                \`);
            }
        `,
    },
    {
      options: withConnection(connections.base),
      name: "empty select statement should not have type annotation",
      code: `conn.query(sql\`select\`);`,
    },
    {
      options: withConnection(connections.base),
      name: "insert statement without returning should not have type annotation",
      code: `conn.query(sql\`insert into team (name) values ('test')\`);`,
    },
    {
      options: withConnection(connections.base),
      name: "insert statement with returning should have type annotation",
      code: `conn.query<{ id: number }>(
          sql\`insert into team (name) values ('test') returning id\`);
        `,
    },
    {
      options: withConnection(connections.base),
      name: "type annotation with a valid type reference",
      code: `
          type Team = { id: number; name: string };
          conn.query<Team>(sql\`select id, name from team\`);
        `,
    },
    {
      options: withConnection(connections.base),
      name: "type annotation with a valid type reference (different property order)",
      code: `
          type Team = { name: string; id: number; };
          conn.query<Team>(sql\`select id, name from team\`);
        `,
    },
    {
      options: withConnection(connections.base),
      name: "type annotation with a valid type reference (interface)",
      code: `
          interface Team { id: number; name: string }
          conn.query<Team>(sql\`select id, name from team\`);
        `,
    },
    {
      options: withConnection(connections.base),
      name: "type annotation with a valid intersection",
      code: `
          conn.query<{ id: number; } & { name: string }>(sql\`select id, name from team\`);
        `,
    },
    {
      options: withConnection(connections.base),
      name: "type annotation with Pick",
      code: `
          interface Team { id: number; name: string }
          conn.query<Pick<Team, "id" | "name">>(sql\`select id, name from team\`);
        `,
    },
    {
      options: withConnection(connections.base),
      name: "type annotation with Pick & intersection",
      code: `
          interface Team { id: number; name: string }
          conn.query<Pick<Team, "id"> & { name: string }>(sql\`select id, name from team\`);
        `,
    },
    {
      options: withConnection(connections.base),
      name: "type annotation with Pick overriden by intersection",
      code: `
          interface Team { id: number; name: string | null }
          conn.query<Team & { name: string }>(sql\`select id, name from team\`);
        `,
    },
    {
      options: withConnection(connections.base),
      name: "union string literal from function arg",
      code: `
          type UnionStringLiteral = "a" | "b";
          function run(union: UnionStringLiteral) {
            conn.query<{ name: string }>(sql\`select name from team WHERE name = \${union}\`);
          }
        `,
    },
    {
      options: withConnection(connections.base),
      name: "select domain type should return its base type",
      code: `
        conn.query<{ email: string }>(sql\`select email from member_email WHERE id = 1\`);
        `,
    },
    {
      name: "don't report on incorrect target",
      options: withConnection(connections.base),
      code: `
          xconn.query(sql\`SELECT 1\`);
          conn.queryNone(sql\`SELECT 1\`);
        `,
    },
    {
      name: "don't report on incorrect target (aliased column)",
      options: withConnection(connections.base),
      code: "xconn.query(sql`SELECT 1 as x`);",
    },
    {
      name: "proper date columns introspection",
      options: withConnection(connections.base),
      code: `
          const dates = conn.query<{
            id: number;
            date_col: Date;
            date_array: Date[];
            instant_arr: Date[];
            time_arr: string[];
            local_date_time_arr: Date[];
            nullable_date_arr: Date[] | null;
          }>(sql\`SELECT * FROM test_date_column\`)
        `,
    },
    {
      name: "select with skipTypeAnnotations",
      options: withConnection(connections.withSkipTypeAnnotations),
      code: "const result = conn.query(sql`SELECT id FROM team`);",
    },
    {
      name: "insert into nullable column a nullable member expression value",
      options: withConnection(connections.withTag),
      code: `
        function insert(data: number | null) {
          sql\`INSERT INTO test_nullable_column (nullable_int) VALUES (\${data})\`
        }
        `,
    },
    {
      name: "insert into nullable column a nullable value",
      options: withConnection(connections.withTag),
      code: `
        function insert(data: { value: number | null }) {
          sql\`INSERT INTO test_nullable_column (nullable_int) VALUES (\${data.value})\`
        }
        `,
    },
    {
      name: "insert into nullable column a null value",
      options: withConnection(connections.withTag),
      code: `sql\`INSERT INTO test_nullable_column (nullable_int) VALUES (\${null})\``,
    },
    {
      name: "insert array of union literals into column",
      options: withConnection(connections.withTag),
      code: `
         async function save(literal: "literalA" | "literalB") {
          sql\`INSERT INTO test_insert_array_union_literals (colname) VALUES (\${[literal]})\`
          }
        `,
    },
    {
      name: "select interval",
      options: withConnection(connections.withTag),
      code: `sql<{ interval: string; }>\`SELECT INTERVAL '1 day 2 hours 3 minutes 4 seconds'\``,
    },
    {
      name: "select jsonb column",
      options: withConnection(connections.withTag),
      code: `sql<{ jsonb_col: any }>\`SELECT jsonb_col FROM test_jsonb\``,
    },
    {
      name: "select nullable boolean column",
      options: withConnection(connections.withTag),
      code: `
          type Result = { colname: boolean | null };
          sql<Result>\`SELECT colname FROM test_nullable_boolean\`
        `,
    },
    {
      name: "select where enum column equals to one of the string literals",
      options: withConnection(connections.withTag),
      code: `
          function run(cert: "owner" | "admin" | "editor" | "contributor" | "viewer" | "guest") {
            sql\`select from member WHERE role = \${cert}\`
            sql\`select from member WHERE role = \${"owner"}\`
            sql\`select from member WHERE role = 'owner'\`
          }
        `,
    },
  ],
  invalid: [
    {
      options: withConnection(connections.base),
      name: "select computed column without type annotation",
      code: "const result = conn.query(sql`SELECT 1 as x`);",
      output: "const result = conn.query<{ x: number }>(sql`SELECT 1 as x`);",
      errors: [
        { messageId: "missingTypeAnnotations", line: 1, column: 16, endLine: 1, endColumn: 26 },
      ],
    },
    {
      options: withConnection(connections.base),
      name: "select computed column without type annotation (with Prisma.sql)",
      code: "const result = conn.query(Prisma.sql`SELECT 1 as x`);",
      output: "const result = conn.query<{ x: number }>(Prisma.sql`SELECT 1 as x`);",
      errors: [
        { messageId: "missingTypeAnnotations", line: 1, column: 16, endLine: 1, endColumn: 26 },
      ],
    },
    {
      options: withConnection(connections.base),
      name: "select column without type annotation",
      code: "const result = conn.query(sql`select id from member`);",
      output: "const result = conn.query<{ id: number }>(sql`select id from member`);",
      errors: [
        { messageId: "missingTypeAnnotations", line: 1, column: 16, endLine: 1, endColumn: 26 },
      ],
    },
    {
      options: withConnection(connections.base),
      name: "select column with incorrect type annotation",
      code: "const result = conn.query<{ id: string }>(sql`select id from member`);",
      output: "const result = conn.query<{ id: number }>(sql`select id from member`);",
      errors: [
        { messageId: "incorrectTypeAnnotations", line: 1, column: 27, endLine: 1, endColumn: 41 },
      ],
    },
    {
      options: withConnection(connections.base),
      name: "select duplicate columns",
      code: "const result = conn.query(sql`select * from member, team`);",
      errors: [
        {
          messageId: "invalidQuery",
          data: {
            error: "Duplicate columns: member.id, team.id",
          },
          line: 1,
          column: 31,
          endLine: 1,
          endColumn: 37,
        },
      ],
    },
    {
      options: withConnection(connections.base),
      name: "select from table where int column equals to ts string arg",
      code: `
            function run(names: string[]) {
                const result = conn.query<{ name: string }>(sql\`
                    select name from team where id = \${names}
                \`);
            }
        `,
      errors: [{ messageId: "invalidQuery", line: 4, column: 52, endLine: 4, endColumn: 53 }],
    },
    {
      options: withConnection(connections.base),
      name: "select statement with invalid conditional expression",
      code: `
            function run(flag: boolean) {
                const result = conn.query<{ name: string }>(sql\`
                    select name from team where id = \${flag ? 1 : 'foo'}
                \`);
            }
        `,
      errors: [
        {
          messageId: "invalidQuery",
          data: {
            error: "Conditional expression must have the same type (true = int, false = text)",
          },
          line: 4,
          column: 56,
          endLine: 4,
          endColumn: 72,
        },
      ],
    },
    {
      options: withConnection(connections.base),
      name: "select statement with invalid type reference",
      code: `
            type Team = { name: string };
            function run() {
                const result = conn.query<Team>(sql\`
                    select id from team where id = \${1}
                \`);
            }
        `,
      output: `
            type Team = { name: string };
            function run() {
                const result = conn.query<{ id: number }>(sql\`
                    select id from team where id = \${1}
                \`);
            }
        `,
      errors: [
        {
          messageId: "incorrectTypeAnnotations",
          data: {
            expected: "{ name: string }",
            actual: "{ id: number }",
          },
          line: 4,
          column: 43,
          endLine: 4,
          endColumn: 47,
        },
      ],
    },
    {
      options: withConnection(connections.base),
      name: "select statement that should not have a type annotation",
      code: `conn.query<{}>(sql\`select\`);`,
      output: `conn.query(sql\`select\`);`,
      errors: [
        {
          messageId: "incorrectTypeAnnotations",
          data: {
            expected: "{ }",
            actual: "No type annotation",
          },
          line: 1,
          column: 12,
          endLine: 1,
          endColumn: 14,
        },
      ],
    },
    {
      options: withConnection(connections.base),
      name: "mixed union literals from function arg",
      code: `
          type UnionStringLiteral = "a" | 1;
          function run(union: UnionStringLiteral) {
            conn.query<{ name: string }>(sql\`select name from team WHERE name = \${union}\`);
          }
        `,
      errors: [
        {
          messageId: "invalidQuery",
          data: {
            error: "Union types must result in the same PostgreSQL type (found text, int)",
          },
        },
      ],
    },
    {
      options: withConnection(connections.base),
      name: "mixed conditional expression literals from function arg",
      code: `
          function run() {
            conn.query<{ name: string }>(sql\`
              select name from team WHERE name = \${(Math.random() > 0.5 ? "a" : 1)}
            \`);
          }
        `,
      errors: [
        {
          messageId: "invalidQuery",
          data: {
            error: "Conditional expression must have the same type (true = text, false = int)",
          },
        },
      ],
    },
    {
      options: withConnection(connections.base),
      name: "this.[name].[operator](...) should be checked as well",
      code: `
          class X {
            run() { const result = this.conn.query(sql\`select 1 as num\`); }
          }
        `,
      output: `
          class X {
            run() { const result = this.conn.query<{ num: number }>(sql\`select 1 as num\`); }
          }
        `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      options: withConnection(connections.withSkipTypeAnnotations),
      name: "invalid select with skipTypeAnnotations",
      code: "const result = conn.query(sql`SELECT idd FROM team`);",
      errors: [
        {
          messageId: "invalidQuery",
          data: { error: 'column "idd" does not exist' },
        },
      ],
    },
    {
      name: "insert into with wrong nullable value",
      options: withConnection(connections.withTag),
      code: `
        function insert(data: string | null) {
          sql\`INSERT INTO test_nullable_column (nullable_int) VALUES (\${data})\`
        }
        `,
      errors: [
        {
          messageId: "invalidQuery",
          data: {
            error: 'column "nullable_int" is of type integer but expression is of type text',
          },
        },
      ],
    },
    {
      name: "insert into with wrong nullable member expression value",
      options: withConnection(connections.withTag),
      code: `
        function insert(data: { value: string | null }) {
          sql\`INSERT INTO test_nullable_column (nullable_int) VALUES (\${data.value})\`
        }
        `,
      errors: [
        {
          messageId: "invalidQuery",
          data: {
            error: 'column "nullable_int" is of type integer but expression is of type text',
          },
        },
      ],
    },
    {
      name: "incorrect comparison of typescript <> postgres enum",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
          enum Role { owner = "owner", admin = "RM" }
          function foo(cert: Role) {
            sql\`select from member where role = \${cert}\`
          }
        `,
      errors: [
        {
          messageId: "invalidQuery",
          data: {
            error: 'invalid input value for enum role: "RM"',
          },
        },
      ],
    },
    {
      name: "reject heterogeneous array union",
      options: withConnection(connections.withTag),
      code: `
          function foo(mixed: (string | number)[]) {
            sql\`INSERT INTO test_insert_array_union_literals (colname) VALUES (\${mixed})\`
          }
        `,
      errors: [
        {
          messageId: "invalidQuery",
          data: {
            error: "Union types must result in the same PostgreSQL type (found text, int)",
          },
        },
      ],
    },
  ],
});
