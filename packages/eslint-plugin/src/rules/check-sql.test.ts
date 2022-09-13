import { generateTestDatabaseName, setupTestDatabase } from "@ts-safeql/test-utils";
import { ESLintUtils } from "@typescript-eslint/utils";
import { RuleTester } from "@typescript-eslint/utils/dist/ts-eslint";
import { after, before, describe, it } from "mocha";
import path from "path";
import { Sql } from "postgres";
import rules from ".";
import { RuleOptionConnection, RuleOptions } from "./check-sql.rule";

const tsconfigRootDir = path.resolve(__dirname, "../../");
const project = "tsconfig.json";
const filename = path.join(tsconfigRootDir, "src/file.ts");

const ruleTester = new ESLintUtils.RuleTester({
  parser: "@typescript-eslint/parser",
  parserOptions: { project, tsconfigRootDir },
  settings: {},
});

const runMigrations1 = <TTypes extends Record<string, unknown>>(sql: Sql<TTypes>) =>
  sql.unsafe(`
    CREATE TABLE caregiver (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        first_name TEXT NOT NULL,
        middle_name TEXT,
        last_name TEXT NOT NULL
    );

    CREATE TABLE agency (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        name TEXT NOT NULL
    );

    CREATE TABLE caregiver_agency (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        caregiver_id INT NOT NULL REFERENCES caregiver(id),
        agency_id INT NOT NULL REFERENCES agency(id)
    );
`);

RuleTester.describe = describe;
RuleTester.it = it;

RuleTester.describe("check-sql", () => {
  RuleTester.it = it;
  const databaseName = generateTestDatabaseName();

  let sql!: Sql<Record<string, unknown>>;
  let dropFn!: () => Promise<number>;

  before(async () => {
    const testDatabase = await setupTestDatabase({
      databaseName: databaseName,
      postgresUrl: "postgres://postgres:postgres@localhost:5432/postgres",
    });

    dropFn = testDatabase.drop;
    sql = testDatabase.sql;

    await runMigrations1(sql);
  });

  after(async () => {
    await sql.end();
    await dropFn();
  });

  const baseConnnection: RuleOptionConnection = {
    databaseUrl: `postgres://postgres:postgres@localhost:5432/${databaseName}`,
    name: "conn",
    operators: ["query"],
    keepAlive: false,
  };

  function withBaseConnection(options: Partial<RuleOptionConnection>): RuleOptions {
    return [{ connections: [{ ...baseConnnection, ...options }] }];
  }

  const baseOptions: RuleOptions = [{ connections: [baseConnnection] }];

  ruleTester.run("base", rules["check-sql"], {
    valid: [
      {
        name: "select computed property",
        filename,
        options: baseOptions,
        code: "const result = conn.query<{ x: Unknown<number>; }>(sql`SELECT 1 as x`);",
      },
      {
        name: "select column from table",
        filename,
        options: baseOptions,
        code: "const result = conn.query<{ id: number; }>(sql`select id from caregiver`);",
      },
      {
        name: "select * from table",
        filename,
        options: baseOptions,
        code: `
              const result = conn.query<{ id: number; first_name: string; middle_name: Nullable<string>; last_name: string; }>(sql\`
                  select * from caregiver
              \`);
          `,
      },
      {
        name: "select from table with inner joins",
        filename,
        options: baseOptions,
        code: `
            const result = conn.query<{ caregiver_id: number; agency_id: number; }>(sql\`
                select
                    caregiver.id as caregiver_id,
                    agency.id as agency_id
                from caregiver
                    join caregiver_agency on caregiver.id = caregiver_agency.caregiver_id
                    join agency on agency.id = caregiver_agency.agency_id
            \`);
        `,
      },
      {
        name: "select from table with left join",
        filename,
        options: baseOptions,
        code: `
            const result = conn.query<{ caregiver_id: number; agency_id: Nullable<number>; }>(sql\`
                select
                    caregiver.id as caregiver_id,
                    agency.id as agency_id
                from caregiver
                    left join caregiver_agency on caregiver.id = caregiver_agency.caregiver_id
                    left join agency on agency.id = caregiver_agency.agency_id
            \`);
        `,
      },
      {
        name: "select from table where int column equals to ts number arg",
        filename,
        options: baseOptions,
        code: `
            function run(id: number) {
                const result = conn.query<{ name: string }>(sql\`
                    select name from agency where id = \${id}
                \`);
            }
        `,
      },
      {
        name: "select from table where int column in an array of ts arg",
        filename,
        options: baseOptions,
        code: `
            function run(ids: number[]) {
                const result = conn.query<{ name: string }>(sql\`
                    select name from agency where id = ANY(\${ids})
                \`);
            }
        `,
      },
      {
        name: "select statement with conditional expression",
        filename,
        options: baseOptions,
        code: `
            function run(flag: boolean) {
                const result = conn.query<{ name: string }>(sql\`
                    select name from agency where id = \${flag ? 1 : 2}
                \`);
            }
        `,
      },
    ],
    invalid: [
      {
        filename,
        options: baseOptions,
        name: "select computed column without type annotation",
        code: "const result = conn.query(sql`SELECT 1 as x`);",
        output: "const result = conn.query<{ x: Unknown<number>; }>(sql`SELECT 1 as x`);",
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        filename,
        options: baseOptions,
        name: "select computed column without type annotation (with Prisma.sql)",
        code: "const result = conn.query(Prisma.sql`SELECT 1 as x`);",
        output: "const result = conn.query<{ x: Unknown<number>; }>(Prisma.sql`SELECT 1 as x`);",
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        filename,
        options: baseOptions,
        name: "select column without type annotation",
        code: "const result = conn.query(sql`select id from caregiver`);",
        output: "const result = conn.query<{ id: number; }>(sql`select id from caregiver`);",
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        filename,
        options: baseOptions,
        name: "select column with incorrect type annotation",
        code: "const result = conn.query<{ id: string; }>(sql`select id from caregiver`);",
        output: "const result = conn.query<{ id: number; }>(sql`select id from caregiver`);",
        errors: [{ messageId: "incorrectTypeAnnotations" }],
      },
      {
        filename,
        options: baseOptions,
        name: "select from table where int column equals to ts string arg",
        code: `
            function run(names: string[]) {
                const result = conn.query<{ name: string }>(sql\`
                    select name from agency where id = \${names}
                \`);
            }
        `,
        errors: [{ messageId: "invalidQuery" }],
      },
      {
        filename,
        options: baseOptions,
        name: "select statement with invalid conditional expression",
        code: `
            function run(flag: boolean) {
                const result = conn.query<{ name: string }>(sql\`
                    select name from agency where id = \${flag ? 1 : 'foo'}
                \`);
            }
        `,
        errors: [
          {
            messageId: "invalidQuery",
            data: {
              error: "Conditional expression must have the same type (true = int, false = text)",
            },
          },
        ],
      },
    ],
  });

  ruleTester.run("base with transform", rules["check-sql"], {
    valid: [
      {
        name: "transform as ${type}[]",
        filename,
        options: withBaseConnection({ transform: "${type}[]" }),
        code: "const result = conn.query<{ id: number; }[]>(sql`select id from caregiver`);",
      },
      {
        name: "transform as ['${type}[]']",
        filename,
        options: withBaseConnection({ transform: ["${type}[]"] }),
        code: "const result = conn.query<{ id: number; }[]>(sql`select id from caregiver`);",
      },
      {
        name: "transform as [['Nullable', 'Maybe']]",
        filename,
        options: withBaseConnection({ transform: [["Nullable", "Maybe"]] }),
        code: "const result = conn.query<{ middle_name: Maybe<string>; }>(sql`select middle_name from caregiver`);",
      },
      {
        name: "transform as ['${type}[]', ['Nullable', 'Maybe']]",
        filename,
        options: withBaseConnection({ transform: ["${type}[]", ["Nullable", "Maybe"]] }),
        code: "const result = conn.query<{ middle_name: Maybe<string>; }[]>(sql`select middle_name from caregiver`);",
      },
    ],
    invalid: [],
  });
});
