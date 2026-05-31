import { InvalidTestCase, RuleTester } from "@typescript-eslint/rule-tester";
import parser from "@typescript-eslint/parser";
import path from "path";
import { afterAll, describe, inject, it } from "vitest";
import rules from "..";
import { RuleOptionConnection, RuleOptions } from "../RuleOptions";

declare module "vitest" {
  interface ProvidedContext {
    checkSqlDatabaseUrl: string;
  }
}

// Each split test file runs in its own fork, so the first rule test in every
// file pays a cold start (TS projectService init + first DB introspection).
// Under parallel CI load that can exceed 10s, so allow the same headroom as the
// shared hook/test timeout.
const RULE_TEST_TIMEOUT_MS = 30_000;

RuleTester.describe = describe;
RuleTester.it = (name, fn) => it(name, fn, RULE_TEST_TIMEOUT_MS);
RuleTester.itOnly = (name, fn) => it.only(name, fn, RULE_TEST_TIMEOUT_MS);
RuleTester.afterAll = afterAll;

const tsFixtureDir = path.resolve(__dirname, "../ts-fixture");

export const checkSqlRule = rules["check-sql"];

type CheckSqlMessageId = keyof (typeof rules)["check-sql"]["meta"]["messages"];

export const ruleTester = new RuleTester({
  languageOptions: {
    parser: parser,
    parserOptions: {
      projectService: true,
      tsconfigRootDir: tsFixtureDir,
    },
  },
  settings: {},
});

function createConnections(databaseUrl: string) {
  return {
    base: {
      databaseUrl,
      targets: [{ wrapper: "conn.query" }],
      keepAlive: false,
    },
    withSkipTypeAnnotations: {
      databaseUrl,
      targets: [{ wrapper: "conn.query", skipTypeAnnotations: true }],
      keepAlive: false,
    },
    withGlobWrapper: {
      databaseUrl,
      targets: [{ wrapper: "conn.+(query|queryOne|queryOneOrNone)" }],
      keepAlive: false,
    },
    withRegexWrapper: {
      databaseUrl,
      targets: [{ wrapper: { regex: "conn.(query|queryOne|queryOneOrNone)" } }],
      keepAlive: false,
    },
    withMaxDepthOf: (maxDepth: number) => ({
      databaseUrl,
      targets: [{ wrapper: "conn.query", maxDepth }],
      keepAlive: false,
    }),
    withTag: {
      databaseUrl,
      targets: [{ tag: "sql" }],
      keepAlive: false,
    },
    withPluginSourcemap: {
      databaseUrl,
      plugins: [
        {
          package: path.resolve(tsFixtureDir, "sourcemap-plugin.ts"),
          config: {},
        },
      ],
      keepAlive: false,
    },
    withPluginTargetPriority: {
      databaseUrl,
      plugins: [
        {
          package: path.resolve(tsFixtureDir, "skip-target-plugin.ts"),
          config: {},
        },
        {
          package: path.resolve(tsFixtureDir, "sourcemap-plugin.ts"),
          config: {},
        },
      ],
      keepAlive: false,
    },
    withMemberTag: {
      databaseUrl,
      targets: [{ tag: "Db.sql" }],
      keepAlive: false,
    },
    withGlobTag: {
      databaseUrl,
      targets: [{ tag: "+(conn1|conn2).sql" }],
      keepAlive: false,
    },
    withRegexTag: {
      databaseUrl,
      targets: [{ tag: { regex: "(conn1|conn2).sql" } }],
      keepAlive: false,
    },
  } satisfies Record<string, RuleOptionConnection | ((...args: never[]) => RuleOptionConnection)>;
}

export type CheckSqlConnections = ReturnType<typeof createConnections>;

export function withConnection(
  connection: RuleOptionConnection,
  options?: Partial<RuleOptionConnection>,
): RuleOptions {
  return [{ connections: [{ ...connection, ...options }] }];
}

export function setupCheckSqlRuleTester() {
  const connections = createConnections(inject("checkSqlDatabaseUrl"));

  function invalidQueryAt({
    line,
    columns,
    error,
    code,
    connection,
  }: {
    line: number;
    columns: [number, number];
    error: string;
    code: string;
    connection?: RuleOptionConnection;
  }): InvalidTestCase<CheckSqlMessageId, RuleOptions> {
    const [column, endColumn] = columns;

    return {
      name: `${line}:[${column}:${endColumn}] - ${error}`,
      options: withConnection(connection ?? connections.withTag),
      code,
      errors: [
        {
          messageId: "invalidQuery",
          data: { error },
          line,
          endLine: line,
          column,
          endColumn,
        },
      ],
    };
  }

  return { connections, withConnection, invalidQueryAt };
}
