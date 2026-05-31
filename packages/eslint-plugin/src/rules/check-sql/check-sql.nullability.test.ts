import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

ruleTester.run("connection with null options", checkSqlRule, {
  valid: [
    {
      name: "use undefined instead of null",
      options: withConnection(connections.withTag, {
        nullAsUndefined: true,
      }),
      code: "sql<{ middle_name: string | undefined }>`select middle_name from member`",
    },
    {
      name: "mark nullable field as optional",
      options: withConnection(connections.withTag, {
        nullAsUndefined: true,
        nullAsOptional: true,
      }),
      code: "sql<{ middle_name?: string | undefined }>`select middle_name from member`",
    },
  ],
  invalid: [
    {
      name: "without nullAsUndefined while result is undefined",
      options: withConnection(connections.withTag),
      code: "sql<{ middle_name: string | undefined }>`select middle_name from member`",
      output: "sql<{ middle_name: string | null }>`select middle_name from member`",
      errors: [
        { messageId: "incorrectTypeAnnotations", line: 1, column: 5, endLine: 1, endColumn: 40 },
      ],
    },
    {
      name: "with nullAsUndefined while result is null",
      options: withConnection(connections.withTag, {
        nullAsUndefined: true,
      }),
      code: "sql<{ middle_name: string | null }>`select middle_name from member`",
      output: "sql<{ middle_name: string | undefined }>`select middle_name from member`",
      errors: [
        { messageId: "incorrectTypeAnnotations", line: 1, column: 5, endLine: 1, endColumn: 35 },
      ],
    },
    {
      name: "without nullAsOptional while result is marked as optional",
      options: withConnection(connections.withTag, {
        nullAsUndefined: true,
      }),
      code: "sql<{ middle_name?: string | undefined }>`select middle_name from member`",
      output: "sql<{ middle_name: string | undefined }>`select middle_name from member`",
      errors: [
        { messageId: "incorrectTypeAnnotations", line: 1, column: 5, endLine: 1, endColumn: 41 },
      ],
    },
    {
      name: "with nullAsOptional while result is marked as required",
      options: withConnection(connections.withTag, {
        nullAsUndefined: true,
        nullAsOptional: true,
      }),
      code: "sql<{ middle_name: string | undefined }>`select middle_name from member`",
      output: "sql<{ middle_name?: string | undefined }>`select middle_name from member`",
      errors: [
        { messageId: "incorrectTypeAnnotations", line: 1, column: 5, endLine: 1, endColumn: 40 },
      ],
    },
  ],
});

ruleTester.run("strict null check", checkSqlRule, {
  valid: [
    {
      name: "strict: select * with a const column. const column should be non-nullable",
      options: withConnection(connections.withTag),
      code: "sql<{ id: number; name: string; now: Date }>`select *, now() from team`",
    },
    {
      name: "strict: select number should be non-nullable",
      options: withConnection(connections.withTag),
      code: "sql<{ x: number }>`select 1 as x`",
    },
    {
      name: "strict: select text should be non-nullable",
      options: withConnection(connections.withTag),
      code: "sql<{ x: '1' }>`select '1' as x`",
    },
    {
      name: "strict: select boolean should be non-nullable",
      options: withConnection(connections.withTag),
      code: "sql<{ '?column?': boolean }>`select true`",
    },
    {
      name: "strict: select count should be non-nullable",
      options: withConnection(connections.withTag),
      code: "sql<{ count: string }>`select count(1)`",
    },
    {
      name: "strict: select interval should be non-nullable",
      options: withConnection(connections.withTag),
      code: "sql<{ interval: string }>`select interval '1 day'`",
    },
    {
      name: "strict: select interval as typecast should be non-nullable",
      options: withConnection(connections.withTag),
      code: "sql<{ interval: string }>`select '1 day'::interval`",
    },
  ],
  invalid: [
    {
      name: "strict: select sum can potentially be null",
      options: withConnection(connections.withTag),
      code: "sql`SELECT sum(member.id) FROM member`",
      output: "sql<{ sum: string | null }>`SELECT sum(member.id) FROM member`",
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "strict: select sum with type cast can still return null",
      options: withConnection(connections.withTag),
      code: "sql`SELECT sum(1)::int`",
      output: "sql<{ sum: number | null }>`SELECT sum(1)::int`",
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "strict: select nullable column with where clause is not null will never be null",
      options: withConnection(connections.withTag),
      code: "sql<{ middle_name: string | null }>`SELECT middle_name FROM member WHERE middle_name IS NOT NULL`",
      output:
        "sql<{ middle_name: string }>`SELECT middle_name FROM member WHERE middle_name IS NOT NULL`",
      errors: [{ messageId: "incorrectTypeAnnotations" }],
    },
  ],
});
