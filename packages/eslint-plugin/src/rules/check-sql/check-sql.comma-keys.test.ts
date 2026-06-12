import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

// Regression: column names containing ", " must compare correctly, including
// through a `transform: "{type}[]"`.
const target = {
  wrapper: "conn.query",
  transform: "{type}[]" as const,
};

ruleTester.run("comma-containing column names", checkSqlRule, {
  valid: [
    {
      name: "matview columns whose names contain ', ' compare as equal",
      options: withConnection(connections.base, { targets: [target] }),
      code: `const result = conn.query<{ member_id: number; "admins, active %": number; "viewers, inactive %": number }[]>(sql\`SELECT * FROM member_role_ratio\`);`,
    },
  ],
  invalid: [
    {
      name: "a genuine type mismatch on a comma-named column is still reported",
      options: withConnection(connections.base, { targets: [target] }),
      code: `const result = conn.query<{ member_id: number; "admins, active %": string; "viewers, inactive %": number }[]>(sql\`SELECT * FROM member_role_ratio\`);`,
      output: `const result = conn.query<{ member_id: number; 'admins, active %': number; 'viewers, inactive %': number }[]>(sql\`SELECT * FROM member_role_ratio\`);`,
      errors: [{ messageId: "incorrectTypeAnnotations" }],
    },
  ],
});
