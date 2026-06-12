import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

// Regression: a materialized view exposing computed columns whose quoted aliases
// contain ", " (e.g. `"admins, active %"`), queried through a wrapper with a
// `transform: "{type}[]"`. The equality check used to `split(", ").sort()` the
// serialized types, which shattered such keys; because the transform appends the
// array suffix to the generated side only — after the split — the `[]` landed in
// a different position on each side and an identical shape was reported as a
// mismatch (with an Expected/Actual that rendered identically).
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
