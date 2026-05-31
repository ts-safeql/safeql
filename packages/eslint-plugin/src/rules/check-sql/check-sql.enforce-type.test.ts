import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

ruleTester.run("enforceType option", checkSqlRule, {
  valid: [
    {
      name: "valid query with enforceType: 'suggest' should pass",
      options: withConnection(connections.withTag, { enforceType: "suggest" }),
      code: "sql<{ id: number }>`select id from member`",
    },
    {
      name: "valid query with enforceType: 'fix' (explicit) should pass",
      options: withConnection(connections.withTag, { enforceType: "fix" }),
      code: "sql<{ id: number }>`select id from member`",
    },
  ],
  invalid: [
    {
      name: "missing type annotation with enforceType: 'suggest' should provide suggestion instead of fix",
      options: withConnection(connections.withTag, { enforceType: "suggest" }),
      code: "sql`select id from member`",
      errors: [
        {
          messageId: "missingTypeAnnotations",
          suggestions: [
            {
              messageId: "missingTypeAnnotations",
              output: "sql<{ id: number }>`select id from member`",
            },
          ],
        },
      ],
    },
    {
      name: "incorrect type annotation with enforceType: 'suggest' should provide suggestion instead of fix",
      options: withConnection(connections.withTag, { enforceType: "suggest" }),
      code: "sql<{ id: string }>`select id from member`",
      errors: [
        {
          messageId: "incorrectTypeAnnotations",
          suggestions: [
            {
              messageId: "incorrectTypeAnnotations",
              output: "sql<{ id: number }>`select id from member`",
            },
          ],
        },
      ],
    },
    {
      name: "missing type annotation with enforceType: 'fix' (explicit) should auto-fix",
      options: withConnection(connections.withTag, { enforceType: "fix" }),
      code: "sql`select id from member`",
      output: "sql<{ id: number }>`select id from member`",
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "missing type annotation with default enforceType should auto-fix",
      options: withConnection(connections.withTag),
      code: "sql`select id from team`",
      output: "sql<{ id: number }>`select id from team`",
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
  ],
});
