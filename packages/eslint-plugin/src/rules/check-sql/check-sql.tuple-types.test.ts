import { normalizeIndent } from "@ts-safeql/shared";
import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

ruleTester.run("tuple types as query parameters", checkSqlRule, {
  valid: [
    {
      name: "NonEmptyArray<string> tuple param validates against a text[] column",
      options: withConnection(connections.withSkipTypeAnnotations),
      code: normalizeIndent`
        type NonEmptyArray<T> = [T, ...T[]];
        function run(values: NonEmptyArray<string>) {
          conn.query(sql\`INSERT INTO test_insert_array_union_literals (colname) VALUES (\${values})\`);
        }
      `,
    },
  ],
  invalid: [
    {
      name: "NonEmptyArray<string> parameter is inferred as text[]",
      options: withConnection(connections.base),
      code: normalizeIndent`
        type NonEmptyArray<T> = [T, ...T[]];
        function run(values: NonEmptyArray<string>) {
          conn.query(sql\`SELECT \${values} AS col\`);
        }
      `,
      output: normalizeIndent`
        type NonEmptyArray<T> = [T, ...T[]];
        function run(values: NonEmptyArray<string>) {
          conn.query<{ col: string[] | null }>(sql\`SELECT \${values} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "NonEmptyArray<number> parameter is inferred as int[], not text[]",
      options: withConnection(connections.base),
      code: normalizeIndent`
        type NonEmptyArray<T> = [T, ...T[]];
        function run(values: NonEmptyArray<number>) {
          conn.query(sql\`SELECT \${values} AS col\`);
        }
      `,
      output: normalizeIndent`
        type NonEmptyArray<T> = [T, ...T[]];
        function run(values: NonEmptyArray<number>) {
          conn.query<{ col: number[] | null }>(sql\`SELECT \${values} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "NonEmptyArray of branded strings is inferred as text[]",
      options: withConnection(connections.base),
      code: normalizeIndent`
        type ID<T> = string & { readonly __brand: "ID"; readonly __type?: T };
        type NonEmptyArray<T> = [T, ...T[]];
        function run(ids: NonEmptyArray<ID<"User">>) {
          conn.query(sql\`SELECT \${ids} AS col\`);
        }
      `,
      output: normalizeIndent`
        type ID<T> = string & { readonly __brand: "ID"; readonly __type?: T };
        type NonEmptyArray<T> = [T, ...T[]];
        function run(ids: NonEmptyArray<ID<"User">>) {
          conn.query<{ col: string[] | null }>(sql\`SELECT \${ids} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "readonly tuple [string, ...string[]] is inferred as text[]",
      options: withConnection(connections.base),
      code: normalizeIndent`
        function run(values: readonly [string, ...string[]]) {
          conn.query(sql\`SELECT \${values} AS col\`);
        }
      `,
      output: normalizeIndent`
        function run(values: readonly [string, ...string[]]) {
          conn.query<{ col: string[] | null }>(sql\`SELECT \${values} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "heterogeneous tuple [string, number] is rejected",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
        function run(values: [string, number]) {
          return sql\`SELECT FROM member WHERE first_name = \${values}\`;
        }
      `,
      errors: [
        {
          messageId: "invalidQuery",
          data: {
            error: "Tuple types must result in the same PostgreSQL type (found text, int)",
          },
        },
      ],
    },
    {
      name: "all-null tuple [null, null] is rejected",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
        function run(values: [null, null]) {
          return sql\`SELECT FROM member WHERE first_name = \${values}\`;
        }
      `,
      errors: [
        { messageId: "invalidQuery", data: { error: "Unsupported tuple type (only null)" } },
      ],
    },
    {
      name: "empty tuple [] is rejected",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
        function run(values: []) {
          return sql\`SELECT FROM member WHERE first_name = \${values}\`;
        }
      `,
      errors: [
        {
          messageId: "invalidQuery",
          data: { error: "Empty tuple types have no corresponding PostgreSQL type" },
        },
      ],
    },
    {
      name: "tuple of string arrays is inferred as text[] (not text[][])",
      options: withConnection(connections.base),
      code: normalizeIndent`
        function run(values: [string[], ...string[][]]) {
          conn.query(sql\`SELECT \${values} AS col\`);
        }
      `,
      output: normalizeIndent`
        function run(values: [string[], ...string[][]]) {
          conn.query<{ col: string[] | null }>(sql\`SELECT \${values} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
  ],
});
