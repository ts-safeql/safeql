import { normalizeIndent } from "@ts-safeql/shared";
import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

ruleTester.run("escaped string literals and enum types", checkSqlRule, {
  valid: [
    {
      name: "accepts escaped quotes and backslashes in enum types",
      options: withConnection(connections.base),
      code: normalizeIndent`
        function run() {
          conn.query<{ col: 'ok' | 'it\\'s' | 'a\\\\b' }>(sql\`SELECT col FROM test_quoted_enum\`);
        }
      `,
    },
    {
      name: "accepts escaped quotes and backslashes in string literals",
      options: withConnection(connections.base),
      code: normalizeIndent`
        function run() {
          conn.query<{ quoted: 'it\\'s'; path: 'a\\\\b' }>(sql\`SELECT 'it''s' AS quoted, 'a\\b' AS path\`);
        }
      `,
    },
    {
      name: "accepts escaped control characters in enum types",
      options: withConnection(connections.base),
      code: normalizeIndent`
        function run() {
          conn.query<{ col: 'line\\nbreak' | 'tab\\tchar' | 'carriage\\rreturn' }>(sql\`SELECT col FROM test_control_enum\`);
        }
      `,
    },
  ],
  invalid: [
    {
      name: "escapes quotes and backslashes in enum types",
      options: withConnection(connections.base),
      code: normalizeIndent`
        function run() {
          conn.query(sql\`SELECT col FROM test_quoted_enum\`);
        }
      `,
      output: normalizeIndent`
        function run() {
          conn.query<{ col: 'ok' | 'it\\'s' | 'a\\\\b' }>(sql\`SELECT col FROM test_quoted_enum\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "escapes quotes and backslashes in string literals",
      options: withConnection(connections.base),
      code: normalizeIndent`
        function run() {
          conn.query(sql\`SELECT 'it''s' AS quoted, 'a\\b' AS path\`);
        }
      `,
      output: normalizeIndent`
        function run() {
          conn.query<{ quoted: 'it\\'s'; path: 'a\\\\b' }>(sql\`SELECT 'it''s' AS quoted, 'a\\b' AS path\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "escapes control characters in enum types",
      options: withConnection(connections.base),
      code: normalizeIndent`
        function run() {
          conn.query(sql\`SELECT col FROM test_control_enum\`);
        }
      `,
      output: normalizeIndent`
        function run() {
          conn.query<{ col: 'line\\nbreak' | 'tab\\tchar' | 'carriage\\rreturn' }>(sql\`SELECT col FROM test_control_enum\`);
        }
      `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
  ],
});
