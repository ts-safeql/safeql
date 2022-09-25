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

  const connections = {
    base: {
      databaseUrl: `postgres://postgres:postgres@localhost:5432/${databaseName}`,
      name: "conn",
      operators: ["query"],
      keepAlive: false,
    },
    withTagName: {
      databaseUrl: `postgres://postgres:postgres@localhost:5432/${databaseName}`,
      tagName: "sql",
      keepAlive: false,
    },
  };

  function withConnection(
    connection: RuleOptionConnection,
    options?: Partial<RuleOptionConnection>
  ): RuleOptions {
    return [{ connections: [{ ...connection, ...options }] }];
  }

  ruleTester.run("base", rules["check-sql"], {
    valid: [
      {
        name: "select non-table column",
        filename,
        options: withConnection(connections.base),
        code: "const result = conn.query<{ x: number; }>(sql`SELECT 1 as x`);",
      },
      {
        name: "select array_agg(stmt)",
        filename,
        options: withConnection(connections.base),
        code: "sql<{ ids: Array<number>; }[]>`SELECT ARRAY_AGG(id ORDER BY id) AS ids FROM caregiver`",
      },
      {
        name: "select exists(stmt",
        filename,
        options: withConnection(connections.base),
        code: "sql<{ exists: boolean }[]>`SELECT EXISTS(select id FROM caregiver)`",
      },
      {
        name: "select not exists(stmt)",
        filename,
        options: withConnection(connections.base),
        code: "sql<{ not_exists: boolean }[]>`SELECT NOT EXISTS(select id FROM caregiver) as not_exists`",
      },
      {
        name: "select column from table",
        filename,
        options: withConnection(connections.base),
        code: "const result = conn.query<{ id: number; }>(sql`select id from caregiver`);",
      },
      {
        name: "select * from table",
        filename,
        options: withConnection(connections.base),
        code: `
              const result = conn.query<{ id: number; first_name: string; middle_name: Nullable<string>; last_name: string; }>(sql\`
                  select * from caregiver
              \`);
          `,
      },
      {
        name: "select from table with inner joins",
        filename,
        options: withConnection(connections.base),
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
        options: withConnection(connections.base),
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
        options: withConnection(connections.base),
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
        options: withConnection(connections.base),
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
        options: withConnection(connections.base),
        code: `
            function run(flag: boolean) {
                const result = conn.query<{ name: string }>(sql\`
                    select name from agency where id = \${flag ? 1 : 2}
                \`);
            }
        `,
      },
      {
        name: "select statement with type reference",
        filename,
        options: withConnection(connections.base),
        code: `
            type Agency = { name: string };
            function run() {
                const result = conn.query<Agency>(sql\`
                    select name from agency
                \`);
            }
        `,
      },

      {
        name: "select statement with interface",
        filename,
        options: withConnection(connections.base),
        code: `
            interface Agency { name: string }
            function run() {
                const result = conn.query<Agency>(sql\`
                    select name from agency
                \`);
            }
        `,
      },
    ],
    invalid: [
      {
        filename,
        options: withConnection(connections.base),
        name: "select computed column without type annotation",
        code: "const result = conn.query(sql`SELECT 1 as x`);",
        output: "const result = conn.query<{ x: number; }>(sql`SELECT 1 as x`);",
        errors: [
          { messageId: "missingTypeAnnotations", line: 1, column: 16, endLine: 1, endColumn: 26 },
        ],
      },
      {
        filename,
        options: withConnection(connections.base),
        name: "select computed column without type annotation (with Prisma.sql)",
        code: "const result = conn.query(Prisma.sql`SELECT 1 as x`);",
        output: "const result = conn.query<{ x: number; }>(Prisma.sql`SELECT 1 as x`);",
        errors: [
          { messageId: "missingTypeAnnotations", line: 1, column: 16, endLine: 1, endColumn: 26 },
        ],
      },
      {
        filename,
        options: withConnection(connections.base),
        name: "select column without type annotation",
        code: "const result = conn.query(sql`select id from caregiver`);",
        output: "const result = conn.query<{ id: number; }>(sql`select id from caregiver`);",
        errors: [
          { messageId: "missingTypeAnnotations", line: 1, column: 16, endLine: 1, endColumn: 26 },
        ],
      },
      {
        filename,
        options: withConnection(connections.base),
        name: "select column with incorrect type annotation",
        code: "const result = conn.query<{ id: string; }>(sql`select id from caregiver`);",
        output: "const result = conn.query<{ id: number; }>(sql`select id from caregiver`);",
        errors: [
          { messageId: "incorrectTypeAnnotations", line: 1, column: 27, endLine: 1, endColumn: 42 },
        ],
      },
      {
        filename,
        options: withConnection(connections.base),
        name: "select from table where int column equals to ts string arg",
        code: `
            function run(names: string[]) {
                const result = conn.query<{ name: string }>(sql\`
                    select name from agency where id = \${names}
                \`);
            }
        `,
        errors: [{ messageId: "invalidQuery", line: 4, column: 54, endLine: 4, endColumn: 55 }],
      },
      {
        filename,
        options: withConnection(connections.base),
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
            line: 4,
            column: 58,
            endLine: 4,
            endColumn: 74,
          },
        ],
      },
      {
        filename,
        options: withConnection(connections.base),
        name: "select statement with invalid type reference",
        code: `
            type Agency = { name: string };
            function run() {
                const result = conn.query<Agency>(sql\`
                    select id from agency where id = \${1}
                \`);
            }
        `,
        output: `
            type Agency = { name: string };
            function run() {
                const result = conn.query<{ id: number; }>(sql\`
                    select id from agency where id = \${1}
                \`);
            }
        `,
        errors: [
          {
            messageId: "incorrectTypeAnnotations",
            data: {
              expected: "{ name: string; }",
              actual: "{ id: number; }",
            },
            line: 4,
            column: 43,
            endLine: 4,
            endColumn: 49,
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
        options: withConnection(connections.base, { transform: "${type}[]" }),
        code: "const result = conn.query<{ id: number; }[]>(sql`select id from caregiver`);",
      },
      {
        name: "transform as ['${type}[]']",
        filename,
        options: withConnection(connections.base, { transform: ["${type}[]"] }),
        code: "const result = conn.query<{ id: number; }[]>(sql`select id from caregiver`);",
      },
      {
        name: "transform as [['Nullable', 'Maybe']]",
        filename,
        options: withConnection(connections.base, { transform: [["Nullable", "Maybe"]] }),
        code: "const result = conn.query<{ middle_name: Maybe<string>; }>(sql`select middle_name from caregiver`);",
      },
      {
        name: "transform as ['${type}[]', ['Nullable', 'Maybe']]",
        filename,
        options: withConnection(connections.base, {
          transform: ["${type}[]", ["Nullable", "Maybe"]],
        }),
        code: "const result = conn.query<{ middle_name: Maybe<string>; }[]>(sql`select middle_name from caregiver`);",
      },
    ],
    invalid: [],
  });

  ruleTester.run("connection with tagName", rules["check-sql"], {
    valid: [
      {
        name: "tagName as sql",
        filename,
        options: withConnection(connections.withTagName),
        code: "sql<{ id: number }>`select id from caregiver`",
      },
      {
        name: "tagName and transform as sql (Postgres.js)",
        filename,
        options: withConnection(connections.withTagName, { transform: "${type}[]" }),
        code: "sql<{ id: number }[]>`select id from caregiver`",
      },
      {
        name: "sql tagName inside a function",
        filename,
        options: withConnection(connections.withTagName),
        code: "const result = conn.query(sql<{ id: number }>`select id from caregiver`);",
      },
    ],
    invalid: [
      {
        name: "tagName without type annotations",
        filename,
        options: withConnection(connections.withTagName),
        code: "sql`select id from caregiver`",
        output: "sql<{ id: number; }>`select id from caregiver`",
        errors: [
          { messageId: "missingTypeAnnotations", line: 1, column: 1, endLine: 1, endColumn: 4 },
        ],
      },
      {
        name: "tagName without type annotations inside a function",
        filename,
        options: withConnection(connections.withTagName),
        code: "const result = conn.query(sql`select id from caregiver`)",
        output: "const result = conn.query(sql<{ id: number; }>`select id from caregiver`)",
        errors: [
          { messageId: "missingTypeAnnotations", line: 1, column: 27, endLine: 1, endColumn: 30 },
        ],
      },
    ],
  });

  ruleTester.run("connection with overrides.types", rules["check-sql"], {
    valid: [
      {
        name: 'with { int4: "Integer" }',
        filename,
        options: withConnection(connections.withTagName, {
          overrides: { types: { int4: "Integer" } },
        }),
        code: "sql<{ id: Integer }>`select id from caregiver`",
      },
    ],
    invalid: [
      {
        name: 'with { int4: "Integer" } while { id: number }',
        filename,
        options: withConnection(connections.withTagName, {
          overrides: { types: { int4: "Integer" } },
        }),
        code: "sql<{ id: number }>`select id from caregiver`",
        output: "sql<{ id: Integer; }>`select id from caregiver`",
        errors: [
          { messageId: "incorrectTypeAnnotations", line: 1, column: 5, endLine: 1, endColumn: 19 },
        ],
      },
    ],
  });

  ruleTester.run("connection with fieldTransform", rules["check-sql"], {
    valid: [
      {
        name: "transform to snake case",
        filename,
        options: withConnection(connections.withTagName, { fieldTransform: "snake" }),
        code: 'sql<{ my_number: number }>`select 1 as "MyNumber"`',
      },
      {
        name: "transform non-table column to camel case",
        filename,
        options: withConnection(connections.withTagName, { fieldTransform: "camel" }),
        code: 'sql<{ myNumber: number }>`select 1 as "my_number"`',
      },
      {
        name: "transform table column to camel case",
        filename,
        options: withConnection(connections.withTagName, { fieldTransform: "camel" }),
        code: "sql<{ firstName: string }>`select first_name from caregiver`",
      },
      {
        name: "transform non-table column to pascal case",
        filename,
        options: withConnection(connections.withTagName, { fieldTransform: "pascal" }),
        code: 'sql<{ MyNumber: number }>`select 1 as "my_number"`',
      },
      {
        name: "transform table column to pascal case",
        filename,
        options: withConnection(connections.withTagName, { fieldTransform: "pascal" }),
        code: "sql<{ FirstName: string }>`select first_name from caregiver`",
      },
      {
        name: "transform non-table column to screaming snake case",
        filename,
        options: withConnection(connections.withTagName, { fieldTransform: "screaming snake" }),
        code: 'sql<{ MY_NUMBER: number }>`select 1 as "my_number"`',
      },
      {
        name: "transform table column to screaming snake case",
        filename,
        options: withConnection(connections.withTagName, { fieldTransform: "screaming snake" }),
        code: "sql<{ FIRST_NAME: string }>`select first_name from caregiver`",
      },
    ],
    invalid: [
      {
        name: "with camelCase while result is snake_case",
        filename,
        options: withConnection(connections.withTagName, { fieldTransform: "camel" }),
        code: "sql<{ first_name: string }>`select first_name from caregiver`",
        output: "sql<{ firstName: string; }>`select first_name from caregiver`",
        errors: [
          { messageId: "incorrectTypeAnnotations", line: 1, column: 5, endLine: 1, endColumn: 27 },
        ],
      },
    ],
  });
});
