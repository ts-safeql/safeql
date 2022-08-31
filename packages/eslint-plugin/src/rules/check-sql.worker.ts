import { generate } from "@testsql/generate";
import { json } from "fp-ts";
import fs from "node:fs";
import path from "node:path";
import postgres, { Sql } from "postgres";
import { runAsWorker } from "synckit";
import { match } from "ts-pattern";
import { initDatabase, mapConnectionOptionsToString, parseConnection } from "../utils/pg.utils";
import { RuleOptions } from "./check-sql.rule";

type SQL = Sql<Record<string, unknown>>;

const connections: Map<string, SQL> = new Map();

interface WorkerParams {
  ruleOptions: RuleOptions;
  query: string;
  projectDir: string;
}

function findOrCreateConnection(databaseUrl: string) {
  let sql = connections.get(databaseUrl);
  let isFirst = false;

  if (sql === undefined) {
    sql = postgres(databaseUrl, { max: 1 });
    connections.set(databaseUrl, sql);
    isFirst = true;
  }

  return { sql, isFirst, databaseUrl };
}

runAsWorker(async (params: WorkerParams) => {
  const strategy = mapRuleOptionsToStartegy(params.ruleOptions);

  const { sql, databaseUrl } = await match(strategy)
    .with({ type: "databaseUrl" }, async ({ databaseUrl }) => findOrCreateConnection(databaseUrl))
    .with({ type: "migrations" }, async ({ migrationsDir, databaseName, connectionUrl }) => {
      const connectionOptions = { ...parseConnection(connectionUrl), database: databaseName };
      const databaseUrl = mapConnectionOptionsToString(connectionOptions);
      const { sql, isFirst } = findOrCreateConnection(databaseUrl);

      if (isFirst) {
        await initDatabase(connectionOptions);
        const absoluteMigrationsDir = path.join(params.projectDir, migrationsDir);
        await runMigrations({ migrationsDir: absoluteMigrationsDir, sql });
      }

      return { sql, isFirst, databaseUrl };
    })
    .exhaustive();

  const value = await generate({
    query: params.query,
    sql: sql,
    cacheKey: databaseUrl,
  });

  return json.stringify(value);
});

async function runMigrations(params: { migrationsDir: string; sql: SQL }) {
  const migrationFiles = await fs.promises
    .readdir(params.migrationsDir)
    .then((files) => files.filter((file) => file.endsWith(".sql")));

  for (const [i, fileName] of migrationFiles.entries()) {
    const migrationQuery = await fs.promises
      .readFile(path.join(params.migrationsDir, fileName))
      .then((x) => x.toString());

    console.log(`(${i + 1}/${migrationFiles.length}) Running ${fileName}`);

    await params.sql.unsafe(migrationQuery);
  }
}

type Strategy =
  | {
      type: "databaseUrl";
      databaseUrl: string;
    }
  | {
      type: "migrations";
      migrationsDir: string;
      connectionUrl: string;
      databaseName: string;
    };

function mapRuleOptionsToStartegy(ruleOptions: RuleOptions): Strategy {
  const options = ruleOptions[0];

  if ("databaseUrl" in options) {
    return { type: "databaseUrl", ...options };
  }

  if ("migrationsDir" in options) {
    const DEFAULT_CONNECTION_URL = "postgres://postgres:postgres@localhost:5432/postgres";

    return { type: "migrations", connectionUrl: DEFAULT_CONNECTION_URL, ...options };
  }

  return match(options).exhaustive();
}
