import { normalizeIndent } from "@ts-safeql/shared";
import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection, invalidQueryAt } = setupCheckSqlRuleTester();

ruleTester.run("position", checkSqlRule, {
  valid: [
    {
      name: "control",
      options: withConnection(connections.withTag),
      code: `
          function run(cert1: "owner" | "admin", cert2: "editor" | "contributor") {
            return sql<{ id: number }>\`
              select id
              from member
              where true 
                and role = \${cert1}
                and member.id = 1
                and role = \${cert2}
                and member.id = 1
            \`
          }
        `,
    },
  ],
  invalid: [
    invalidQueryAt({
      code: "sql`select idd from member`",
      error: 'column "idd" does not exist',
      line: 1,
      columns: [12, 15],
    }),
    invalidQueryAt({
      code: normalizeIndent`
          sql\`
            select
              id
            from
              memberr
          \`
        `,
      error: 'relation "memberr" does not exist',
      line: 5,
      columns: [5, 12],
    }),
    invalidQueryAt({
      code: normalizeIndent`
          function run(expr1: "owner" | "admin", expr2: "editor" | "CNN") {
            sql\`
              select id
              from
                member
              where true
                and role = \${expr1}
                and member.id = 1
                and role = \${expr2}
                and member.id = 1
            \`
          }
        `,
      error: 'invalid input value for enum role: "CNN"',
      line: 9,
      columns: [18, 26],
    }),
    invalidQueryAt({
      code: normalizeIndent`
          function run(cert1: "owner" | "RNA") {
            return sql\`select id from member where role = \${cert1}\`
          }
        `,
      error: 'invalid input value for enum role: "RNA"',
      line: 2,
      columns: [49, 57],
    }),
    invalidQueryAt({
      code: normalizeIndent`
          function run(cert: "owner" | "admin'") {
            return sql\`select id from member where role = \${cert}\`
          }
        `,
      error: `invalid input value for enum role: "admin'"`,
      line: 2,
      columns: [49, 56],
    }),
    invalidQueryAt({
      code: "sql`select id, id from member`",
      error: `Duplicate columns: member.id, member.id`,
      line: 1,
      columns: [12, 14],
    }),
    invalidQueryAt({
      code: "sql`select id sele, role sele from member`",
      error: `Duplicate columns: member.id (alias: sele), member.role (alias: sele)`,
      line: 1,
      columns: [15, 19],
    }),
  ],
});
