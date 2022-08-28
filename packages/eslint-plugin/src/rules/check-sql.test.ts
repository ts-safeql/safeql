import { ESLintUtils } from "@typescript-eslint/utils";
import rules from ".";

const ruleTester = new ESLintUtils.RuleTester({
  parser: "@typescript-eslint/parser",
});

const options = [{ databaseUrl: "postgres://postgres:postgres@localhost:5432/medflyt_test_sim" }];

ruleTester.run("check-sql", rules["check-sql"], {
  valid: [
    {
      options: options,
      code: "const a = conn.queryOne<{ x: Unknown<number>; }>(sql`SELECT 1 as x`);",
    },
  ],
  invalid: [
    {
      options: options,
      code: "const a = conn.queryOne(sql`SELECT 1 as x`);",
      output: "const a = conn.queryOne<{ x: Unknown<number>; }>(sql`SELECT 1 as x`);",
      errors: [{ messageId: "queryMissingTypeAnnotations" }],
    },
    // {
    //   options: options,
    //   code: "const a = conn.queryOne(sql`SELECT 1 as x`);",
    //   output: "const a = conn.queryOne<{ x: Unknown<string>; }>(sql`SELECT 1 as x`);",
    //   errors: [{ messageId: "queryInvalidTypeAnnotations" }],
    // },
  ],
});
