import { generateTestDatabaseName, setupTestDatabase } from "@ts-safeql/test-utils";
import { RuleTester } from "@typescript-eslint/rule-tester";
import parser from "@typescript-eslint/parser";
import path from "path";
import { Sql } from "postgres";
import { afterAll, beforeAll, describe, it } from "vitest";
import { rules } from "@ts-safeql/eslint-plugin";
import type { PluginDescriptor } from "@ts-safeql/plugin-utils";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.afterAll = afterAll;

const POSTGRES_URL = "postgres://postgres:postgres@localhost:5432/postgres";

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: {
      projectService: true,
      tsconfigRootDir: path.resolve(__dirname, "./ts-fixture"),
    },
  },
});

const kyselyPlugin = {
  package: "@ts-safeql/plugin-kysely",
  config: {},
} satisfies PluginDescriptor;

const withSchemaConnection = (
  databaseName: string,
  schema: {
    type: string;
    fieldTransform?: "snake" | "camel" | "pascal" | "screaming snake";
    excludeTables?: string[];
  },
) => [
  {
    connections: [
      {
        databaseUrl: `postgres://postgres:postgres@localhost:5432/${databaseName}`,
        plugins: [kyselyPlugin],
        keepAlive: false,
        schema,
      },
    ],
  },
];

RuleTester.describe("kysely integration — check-schema", () => {
  const databaseName = generateTestDatabaseName();
  let sql!: Sql;
  let dropFn!: () => Promise<unknown>;

  beforeAll(async () => {
    const testDatabase = await setupTestDatabase({ databaseName, postgresUrl: POSTGRES_URL });
    dropFn = testDatabase.drop;
    sql = testDatabase.sql;

    await sql.unsafe(`
      CREATE TABLE person (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        first_name TEXT NOT NULL,
        bio TEXT
      );
    `);
  });

  RuleTester.afterAll(async () => {
    await sql.end();
    await dropFn();
  });

  ruleTester.run("check-schema", rules["check-schema"], {
    valid: [
      {
        name: "Database type matching the live schema passes",
        options: withSchemaConnection(databaseName, { type: "Database" }),
        code: `
interface Database {
  person: { id: number; first_name: string; bio: string | null };
}
declare const _db: Database;`,
      },
      {
        name: "Kysely wrappers (Generated/ColumnType) are unwrapped to their select type",
        options: withSchemaConnection(databaseName, { type: "Database" }),
        code: `
import { ColumnType, Generated } from "kysely";
interface Database {
  person: {
    id: Generated<number>;
    first_name: string;
    bio: ColumnType<string | null, string, string>;
  };
}
declare const _db: Database;`,
      },
      {
        name: "camelCase Database type matches via fieldTransform",
        options: withSchemaConnection(databaseName, { type: "Database", fieldTransform: "camel" }),
        code: `
interface Database {
  person: { id: number; firstName: string; bio: string | null };
}
declare const _db: Database;`,
      },
      {
        name: "no Database type → nothing to check",
        options: withSchemaConnection(databaseName, { type: "Database" }),
        code: `const x = 1;`,
      },
    ],
    invalid: [
      {
        name: "wrong column type is reported",
        options: withSchemaConnection(databaseName, { type: "Database" }),
        code: `
interface Database {
  person: { id: string; first_name: string; bio: string | null };
}
declare const _db: Database;`,
        errors: [{ messageId: "schemaColumnTypeMismatch" }],
      },
      {
        name: "wrong nullability is reported",
        options: withSchemaConnection(databaseName, { type: "Database" }),
        code: `
interface Database {
  person: { id: number; first_name: string; bio: string };
}
declare const _db: Database;`,
        errors: [{ messageId: "schemaColumnTypeMismatch" }],
      },
      {
        name: "column typed but missing from the database is reported",
        options: withSchemaConnection(databaseName, { type: "Database" }),
        code: `
interface Database {
  person: { id: number; first_name: string; bio: string | null; email: string };
}
declare const _db: Database;`,
        errors: [{ messageId: "schemaMissingColumn" }],
      },
      {
        name: "column in the database but missing from the type is reported",
        options: withSchemaConnection(databaseName, { type: "Database" }),
        code: `
interface Database {
  person: { id: number; first_name: string };
}
declare const _db: Database;`,
        errors: [{ messageId: "schemaExtraColumn" }],
      },
      {
        name: "table typed but missing from the database is reported",
        options: withSchemaConnection(databaseName, { type: "Database" }),
        code: `
interface Database {
  person: { id: number; first_name: string; bio: string | null };
  pet: { id: number };
}
declare const _db: Database;`,
        errors: [{ messageId: "schemaMissingTable" }],
      },
    ],
  });
});
