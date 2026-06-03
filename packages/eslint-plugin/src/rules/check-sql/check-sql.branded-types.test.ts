import { normalizeIndent } from "@ts-safeql/shared";
import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

ruleTester.run("branded types as query parameters", checkSqlRule, {
  valid: [],
  invalid: [
    {
      name: "branded string parameter is inferred as text",
      options: withConnection(connections.base),
      code: normalizeIndent`
        type ID<T> = string & { readonly __brand: "ID"; readonly __type?: T };
        function run(id: ID<"User">) {
          conn.query(sql\`SELECT \${id} AS col\`);
        }
      `,
      output: normalizeIndent`
        type ID<T> = string & { readonly __brand: "ID"; readonly __type?: T };
        function run(id: ID<"User">) {
          conn.query<{ col: string | null }>(sql\`SELECT \${id} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "branded number parameter is inferred as int, not text",
      options: withConnection(connections.base),
      code: normalizeIndent`
        type NumericId = number & { readonly __brand: "NumericId" };
        function run(id: NumericId) {
          conn.query(sql\`SELECT \${id} AS col\`);
        }
      `,
      output: normalizeIndent`
        type NumericId = number & { readonly __brand: "NumericId" };
        function run(id: NumericId) {
          conn.query<{ col: number | null }>(sql\`SELECT \${id} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "branded string is inferred as text regardless of intersection order",
      options: withConnection(connections.base),
      code: normalizeIndent`
        type ID<T> = { readonly __brand: "ID"; readonly __type?: T } & string;
        function run(id: ID<"User">) {
          conn.query(sql\`SELECT \${id} AS col\`);
        }
      `,
      output: normalizeIndent`
        type ID<T> = { readonly __brand: "ID"; readonly __type?: T } & string;
        function run(id: ID<"User">) {
          conn.query<{ col: string | null }>(sql\`SELECT \${id} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "branded string with multiple marker objects is inferred as text",
      options: withConnection(connections.base),
      code: normalizeIndent`
        type Tagged = string & { readonly __a: 1 } & { readonly __b: 2 };
        function run(id: Tagged) {
          conn.query(sql\`SELECT \${id} AS col\`);
        }
      `,
      output: normalizeIndent`
        type Tagged = string & { readonly __a: 1 } & { readonly __b: 2 };
        function run(id: Tagged) {
          conn.query<{ col: string | null }>(sql\`SELECT \${id} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "string intersected with a non-marker object is inferred as text",
      options: withConnection(connections.base),
      code: normalizeIndent`
        type Weird = string & { id: number; createdAt: string };
        function run(value: Weird) {
          conn.query(sql\`SELECT \${value} AS col\`);
        }
      `,
      output: normalizeIndent`
        type Weird = string & { id: number; createdAt: string };
        function run(value: Weird) {
          conn.query<{ col: string | null }>(sql\`SELECT \${value} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "array of branded strings is inferred as text[]",
      options: withConnection(connections.base),
      code: normalizeIndent`
        type ID<T> = string & { readonly __brand: "ID"; readonly __type?: T };
        function run(ids: ID<"User">[]) {
          conn.query(sql\`SELECT \${ids} AS col\`);
        }
      `,
      output: normalizeIndent`
        type ID<T> = string & { readonly __brand: "ID"; readonly __type?: T };
        function run(ids: ID<"User">[]) {
          conn.query<{ col: string[] | null }>(sql\`SELECT \${ids} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "branded string union with null is inferred as text",
      options: withConnection(connections.base),
      code: normalizeIndent`
        type ID<T> = string & { readonly __brand: "ID"; readonly __type?: T };
        function run(id: ID<"User"> | null) {
          conn.query(sql\`SELECT \${id} AS col\`);
        }
      `,
      output: normalizeIndent`
        type ID<T> = string & { readonly __brand: "ID"; readonly __type?: T };
        function run(id: ID<"User"> | null) {
          conn.query<{ col: string | null }>(sql\`SELECT \${id} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "array of nullable branded strings is inferred as text[]",
      options: withConnection(connections.base),
      code: normalizeIndent`
        type ID<T> = string & { readonly __brand: "ID"; readonly __type?: T };
        function run(ids: (ID<"User"> | null)[]) {
          conn.query(sql\`SELECT \${ids} AS col\`);
        }
      `,
      output: normalizeIndent`
        type ID<T> = string & { readonly __brand: "ID"; readonly __type?: T };
        function run(ids: (ID<"User"> | null)[]) {
          conn.query<{ col: string[] | null }>(sql\`SELECT \${ids} AS col\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "branded string is still rejected against a non-text column",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
        type ID<T> = string & { readonly __brand: "ID"; readonly __type?: T };
        function run(id: ID<"User">) {
          return sql\`INSERT INTO test_nullable_column (nullable_int) VALUES (\${id})\`;
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
      name: "non-branded object intersection is rejected",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
        type A = { a: number };
        type B = { b: number };
        function run(x: A & B) {
          return sql\`SELECT FROM member WHERE first_name = \${x}\`;
        }
      `,
      errors: [
        {
          messageId: "invalidQuery",
          data: { error: "No PostgreSQL type could be inferred for the intersection: A & B" },
        },
      ],
    },
    {
      name: "intersection of two conflicting base types is rejected",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
        type Weird = string & Date;
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
  ],
});
