import { normalizeIndent } from "@ts-safeql/shared";
import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

ruleTester.run("one-of transformation", checkSqlRule, {
  valid: [
    {
      name: "control (select where)",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
          function union(cert: "owner" | "admin", cert2: "editor" | "contributor") {
            return sql\`SELECT FROM member WHERE role = \${cert}\`
          }
        `,
    },
    {
      name: "control (update set)",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
          function union(cert: "owner" | "admin", cert2: "editor" | "contributor") {
            return sql\`UPDATE member SET role = \${cert}::role WHERE id = 1\`
          }
        `,
    },
    {
      name: "select where with a trailing cast (must not apply the IN-rewrite over a ::cast)",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
          function union(cert: "owner" | "admin") {
            return sql\`SELECT FROM member WHERE role = \${cert}::role\`
          }
        `,
    },
    {
      name: "join on context with a trailing cast",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
          function union(cert: "owner" | "admin") {
            return sql\`SELECT FROM member c JOIN role_metadata ct ON c.role = \${cert}::role\`
          }
        `,
    },
    {
      name: "having context with a trailing cast",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
          function union(cert: "owner" | "admin") {
            return sql\`SELECT FROM member GROUP BY role HAVING role = \${cert}::role\`
          }
        `,
    },
    {
      name: "whitespace between the parameter and the trailing cast",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
          function union(cert: "owner" | "admin") {
            return sql\`SELECT FROM member WHERE role = \${cert} ::role\`
          }
        `,
    },
    {
      name: "join context",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
          function joinTest(cert: "owner" | "admin") {
            return sql\`SELECT FROM member c JOIN role_metadata ct ON c.role = \${cert}\`
          }
        `,
    },
    {
      name: "case context",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
          function caseTest(cert: "owner" | "admin") {
            return sql<{ is_certified: number }>\`
              SELECT CASE WHEN role = \${cert} THEN 1 ELSE 0 END AS is_certified
              FROM member
            \`
          }
        `,
    },
    {
      name: "having context",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
          function havingTest(cert: "owner" | "admin") {
            return sql\`SELECT FROM member GROUP BY role HAVING role = \${cert}\`
          }
        `,
    },
    {
      name: "returning context",
      options: withConnection(connections.withTag),
      code: normalizeIndent`
          function returningTest(cert: "owner" | "admin") {
            return sql<{ one_of: boolean | null }>\`
              UPDATE member
              SET id = DEFAULT
              WHERE FALSE
              RETURNING role = \${cert} AS one_of\`
          }
        `,
    },
  ],
  invalid: [],
});
