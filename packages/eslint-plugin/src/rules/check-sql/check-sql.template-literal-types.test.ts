import { normalizeIndent } from "@ts-safeql/shared";
import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

ruleTester.run("template-literal types as query parameters", checkSqlRule, {
  valid: [
    {
      name: "array of template-literals validates against a real text[] column",
      options: withConnection(connections.withSkipTypeAnnotations),
      code: normalizeIndent`
        function run(values: \`\${number}\`[]) {
          conn.query(sql\`INSERT INTO test_insert_array_union_literals (colname) VALUES (\${values})\`);
        }
      `,
    },
  ],
  invalid: [
    {
      name: "`${number}` template-literal parameter is inferred as text",
      options: withConnection(connections.base),
      code: normalizeIndent`
        function run(value: \`\${number}\`) {
          conn.query(sql\`SELECT \${value} AS col\`);
        }
      `,
      output: normalizeIndent`
        function run(value: \`\${number}\`) {
          conn.query<{ col: string | null }>(sql\`SELECT \${value} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "`${string}` template-literal parameter is inferred as text",
      options: withConnection(connections.base),
      code: normalizeIndent`
        function run(value: \`prefix-\${string}\`) {
          conn.query(sql\`SELECT \${value} AS col\`);
        }
      `,
      output: normalizeIndent`
        function run(value: \`prefix-\${string}\`) {
          conn.query<{ col: string | null }>(sql\`SELECT \${value} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "branded Money (`${number}` & { __brand }) is inferred as text via intersection composition",
      options: withConnection(connections.base),
      code: normalizeIndent`
        type Money = \`\${number}\` & { readonly __brand: "Money" };
        function run(amount: Money) {
          conn.query(sql\`SELECT \${amount} AS col\`);
        }
      `,
      output: normalizeIndent`
        type Money = \`\${number}\` & { readonly __brand: "Money" };
        function run(amount: Money) {
          conn.query<{ col: string | null }>(sql\`SELECT \${amount} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "array of template-literals is inferred as text[]",
      options: withConnection(connections.base),
      code: normalizeIndent`
        function run(values: \`\${number}\`[]) {
          conn.query(sql\`SELECT \${values} AS col\`);
        }
      `,
      output: normalizeIndent`
        function run(values: \`\${number}\`[]) {
          conn.query<{ col: string[] | null }>(sql\`SELECT \${values} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "array of branded Money is inferred as text[]",
      options: withConnection(connections.base),
      code: normalizeIndent`
        type Money = \`\${number}\` & { readonly __brand: "Money" };
        function run(amounts: Money[]) {
          conn.query(sql\`SELECT \${amounts} AS col\`);
        }
      `,
      output: normalizeIndent`
        type Money = \`\${number}\` & { readonly __brand: "Money" };
        function run(amounts: Money[]) {
          conn.query<{ col: string[] | null }>(sql\`SELECT \${amounts} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "`${number}` template-literal is still rejected against a non-text column",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
        function run(value: \`\${number}\`) {
          return sql\`INSERT INTO test_nullable_column (nullable_int) VALUES (\${value})\`;
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
      name: "template-literal intersected with a conflicting base type is rejected",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
        type Weird = \`\${number}\` & Date;
        function run(x: Weird) {
          return sql\`SELECT FROM member WHERE first_name = \${x}\`;
        }
      `,
      errors: [
        {
          messageId: "invalidQuery",
          data: {
            error: "Intersection types must result in the same PostgreSQL type (found text, date)",
          },
        },
      ],
    },
    {
      name: "intrinsic string-mapping type (Uppercase<string>) is inferred as text",
      options: withConnection(connections.base),
      code: normalizeIndent`
        function run(value: Uppercase<string>) {
          conn.query(sql\`SELECT \${value} AS col\`);
        }
      `,
      output: normalizeIndent`
        function run(value: Uppercase<string>) {
          conn.query<{ col: string | null }>(sql\`SELECT \${value} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "branded Money is still rejected against a non-text column",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
        type Money = \`\${number}\` & { readonly __brand: "Money" };
        function run(amount: Money) {
          return sql\`INSERT INTO test_nullable_column (nullable_int) VALUES (\${amount})\`;
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
  ],
});
