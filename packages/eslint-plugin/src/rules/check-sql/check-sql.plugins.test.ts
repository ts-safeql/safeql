import { normalizeIndent } from "@ts-safeql/shared";
import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, invalidQueryAt } = setupCheckSqlRuleTester();

ruleTester.run("plugin position", checkSqlRule, {
  valid: [],
  invalid: [
    invalidQueryAt({
      connection: connections.withPluginSourcemap,
      code: normalizeIndent`
          declare function sql(strings: TemplateStringsArray, ...values: unknown[]): unknown;
          declare function ident(value: string): unknown;

          sql\`SELECT 1 FROM \${ident("missing_person")}\`;
        `,
      error: 'relation "missing_person" does not exist',
      line: 3,
      columns: [19, 45],
    }),
    invalidQueryAt({
      connection: connections.withPluginSourcemap,
      code: normalizeIndent`
          declare function sql(strings: TemplateStringsArray, ...values: unknown[]): unknown;
          declare function ident(value: string): unknown;

          sql\`SELECT id FROM \${ident("member")} WHERE nonexistent = 1\`;
        `,
      error: 'column "nonexistent" does not exist',
      line: 3,
      columns: [45, 56],
    }),
    invalidQueryAt({
      connection: connections.withPluginSourcemap,
      code: normalizeIndent`
          declare function sql(strings: TemplateStringsArray, ...values: unknown[]): unknown;
          declare function unnest2(): unknown;

          sql\`
            SELECT bar
            FROM \${unnest2()} AS foo(bar, baz)
            WHERE nope = 1
          \`;
        `,
      error: 'column "nope" does not exist',
      line: 6,
      columns: [9, 13],
    }),
    invalidQueryAt({
      connection: connections.withPluginSourcemap,
      code: normalizeIndent`
          declare function sql(strings: TemplateStringsArray, ...values: unknown[]): unknown;
          declare function jsonb(value: unknown): unknown;

          sql\`
            SELECT \${jsonb([1, 2, 3])}::jsonb ->> 0 AS p
            UNION
            SELE2CT \${jsonb([1, "f", 3])}::jsonb ->> 0 AS p
          \`;
        `,
      error: 'syntax error at or near "SELE2CT"',
      line: 6,
      columns: [3, 10],
    }),
  ],
});

ruleTester.run("plugin priority", checkSqlRule, {
  valid: [
    {
      name: "first target plugin match wins",
      options: [{ connections: [connections.withPluginTargetPriority] }],
      code: normalizeIndent`
          declare function sql(strings: TemplateStringsArray, ...values: unknown[]): unknown;

          sql\`TOTAL GARBAGE\`;
      `,
    },
  ],
  invalid: [],
});
