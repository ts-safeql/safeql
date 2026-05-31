import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

ruleTester.run("connection with fieldTransform", checkSqlRule, {
  valid: [
    {
      name: "transform to snake case",
      options: withConnection(connections.withTag, {
        targets: [{ tag: "sql", fieldTransform: "snake" }],
      }),
      code: 'sql<{ my_number: number }>`select 1 as "MyNumber"`',
    },
    {
      name: "transform non-table column to camel case",
      options: withConnection(connections.withTag, {
        targets: [{ tag: "sql", fieldTransform: "camel" }],
      }),
      code: 'sql<{ myNumber: number }>`select 1 as "my_number"`',
    },
    {
      name: "transform table column to camel case",
      options: withConnection(connections.withTag, {
        targets: [{ tag: "sql", fieldTransform: "camel" }],
      }),
      code: "sql<{ firstName: string }>`select first_name from member`",
    },
    {
      name: "transform non-table column to pascal case",
      options: withConnection(connections.withTag, {
        targets: [{ tag: "sql", fieldTransform: "pascal" }],
      }),
      code: 'sql<{ MyNumber: number }>`select 1 as "my_number"`',
    },
    {
      name: "transform table column to pascal case",
      options: withConnection(connections.withTag, {
        targets: [{ tag: "sql", fieldTransform: "pascal" }],
      }),
      code: "sql<{ FirstName: string }>`select first_name from member`",
    },
    {
      name: "transform non-table column to screaming snake case",
      options: withConnection(connections.withTag, {
        targets: [{ tag: "sql", fieldTransform: "screaming snake" }],
      }),
      code: 'sql<{ MY_NUMBER: number }>`select 1 as "my_number"`',
    },
    {
      name: "transform table column to screaming snake case",
      options: withConnection(connections.withTag, {
        targets: [{ tag: "sql", fieldTransform: "screaming snake" }],
      }),
      code: "sql<{ FIRST_NAME: string }>`select first_name from member`",
    },
  ],
  invalid: [
    {
      name: "with camelCase while result is snake_case",
      options: withConnection(connections.withTag, {
        targets: [{ tag: "sql", fieldTransform: "camel" }],
      }),
      code: "sql<{ first_name: string }>`select first_name from member`",
      output: "sql<{ firstName: string }>`select first_name from member`",
      errors: [
        { messageId: "incorrectTypeAnnotations", line: 1, column: 5, endLine: 1, endColumn: 27 },
      ],
    },
  ],
});
