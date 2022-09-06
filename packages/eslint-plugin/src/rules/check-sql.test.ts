import { generateTestDatabaseName, setupTestDatabase } from "@safeql/test-utils";
import { ESLintUtils } from "@typescript-eslint/utils";
import { RuleTester } from "@typescript-eslint/utils/dist/ts-eslint";
import { after, before, describe, it } from "mocha";
import path from "node:path";
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
        id SERIAL PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL
    );

    CREATE TABLE agency (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
    );

    CREATE TABLE caregiver_agency (
        id SERIAL PRIMARY KEY,
        caregiver_id INT NOT NULL REFERENCES caregiver(id),
        agency_id INT NOT NULL REFERENCES agency(id)
    );
`);

RuleTester.describe = describe;
RuleTester.it = it;

RuleTester.describe("check-sql", () => {
  RuleTester.it = it;
  const databaseName = generateTestDatabaseName();

  const connOption: RuleOptionConnection = {
    databaseUrl: `postgres://postgres:postgres@localhost:5432/${databaseName}`,
    name: "conn",
    operators: ["query"],
    keepAlive: false,
  };

  const options: RuleOptions = [{ connections: [connOption] }];

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

  ruleTester.run("basic", rules["check-sql"], {
    valid: [
      {
        name: "select computed property",
        filename,
        options: options,
        code: "const result = conn.query<{ x: Unknown<number>; }>(sql`SELECT 1 as x`);",
      },
      {
        name: "select column from table",
        filename,
        options: options,
        code: "const result = conn.query<{ id: number; }>(sql`select id from caregiver`);",
      },
      {
        name: "select * from table",
        filename,
        options: options,
        code: `
              const result = conn.query<{ id: number; first_name: string; last_name: string; }>(sql\`
                  select * from caregiver
              \`);
          `,
      },
      {
        name: "select from table with inner joins",
        filename,
        options: options,
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
        options: options,
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
        options: options,
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
        options: options,
        code: `
            function run(ids: number[]) {
                const result = conn.query<{ name: string }>(sql\`
                    select name from agency where id = ANY(\${ids})
                \`);
            }
        `,
      },
    ],
    invalid: [
      {
        filename,
        options: options,
        name: "select computed column without type annotation",
        code: "const result = conn.query(sql`SELECT 1 as x`);",
        output: "const result = conn.query<{ x: Unknown<number>; }>(sql`SELECT 1 as x`);",
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        filename,
        options: options,
        name: "select column without type annotation",
        code: "const result = conn.query(sql`select id from caregiver`);",
        output: "const result = conn.query<{ id: number; }>(sql`select id from caregiver`);",
        errors: [{ messageId: "missingTypeAnnotations" }],
      },
      {
        filename,
        options: options,
        name: "select column with incorrect type annotation",
        code: "const result = conn.query<{ id: string; }>(sql`select id from caregiver`);",
        output: "const result = conn.query<{ id: number; }>(sql`select id from caregiver`);",
        errors: [{ messageId: "incorrectTypeAnnotations" }],
      },
      {
        filename,
        options: options,
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
    ],
  });
});
