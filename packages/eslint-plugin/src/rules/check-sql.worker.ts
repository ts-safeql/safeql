import { generate } from "@testsql/generate";
import { GenerateError } from "@testsql/generate/src/generate";
import { either, json, taskEither } from "fp-ts";
import { pipe } from "fp-ts/lib/function";
import fs from "node:fs";
import path from "node:path";
import postgres, { Sql } from "postgres";
import { runAsWorker } from "synckit";
import { match } from "ts-pattern";
import { initDatabase, mapConnectionOptionsToString, parseConnection } from "../utils/pg.utils";
import { RuleOptionConnection } from "./check-sql.rule";

type SQL = Sql<Record<string, unknown>>;

const connections: Map<string, SQL> = new Map();

interface WorkerParams {
  connection: RuleOptionConnection;
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
  const strategy = mapRuleOptionsToStartegy(params.connection);

  // TODO chain all of the flow into one pipe
  const result = await match(strategy)
    .with({ type: "databaseUrl" }, async ({ databaseUrl }) =>
      either.right(findOrCreateConnection(databaseUrl))
    )
    .with({ type: "migrations" }, async ({ migrationsDir, databaseName, connectionUrl }) => {
      const connectionOptions = { ...parseConnection(connectionUrl), database: databaseName };
      const databaseUrl = mapConnectionOptionsToString(connectionOptions);
      const { sql, isFirst } = findOrCreateConnection(databaseUrl);

      if (isFirst) {
        await initDatabase(connectionOptions);
        const migrationsPath = path.join(params.projectDir, migrationsDir);
        const migrationResult = await runMigrations({ migrationsPath, sql });

        if (either.isLeft(migrationResult)) {
          return migrationResult;
        }
      }

      return either.right({ sql, isFirst, databaseUrl });
    })
    .exhaustive();

  if (either.isLeft(result)) {
    return json.stringify(
      either.left({
        type: "MigrationError",
        error: result.left.message,
      } as GenerateError)
    );
  }

  const { databaseUrl, sql } = result.right;

  const value = await generate({
    query: params.query,
    sql: sql,
    cacheKey: databaseUrl,
  });

  return json.stringify(value);
});

async function runMigrations(params: { migrationsPath: string; sql: SQL }) {
  const runSingleMigrationFileWithSql = (file: string) =>
    runSingleMigrationFile(params.sql, path.join(params.migrationsPath, file));

  return pipe(
    getMigrationFiles(params.migrationsPath),
    taskEither.chain((files) =>
      taskEither.sequenceSeqArray(files.map(runSingleMigrationFileWithSql))
    )
  )();
}

function getMigrationFiles(migrationsDir: string) {
  return pipe(
    taskEither.tryCatch(() => fs.promises.readdir(migrationsDir), either.toError),
    taskEither.mapLeft(
      (error) => new Error(`Failed to read migrations directory "${migrationsDir}": ${error}`)
    ),
    taskEither.map((files) => files.filter((file) => file.endsWith(".sql")))
  );
}

function runSingleMigrationFile(sql: SQL, filePath: string) {
  return pipe(
    taskEither.tryCatch(
      () => fs.promises.readFile(filePath).then((x) => x.toString()),
      either.toError
    ),
    taskEither.chain((content) => taskEither.tryCatch(() => sql.unsafe(content), either.toError)),
    taskEither.mapLeft((error) => new Error(`Failed to run migration file "${filePath}": ${error}`))
  );
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

function mapRuleOptionsToStartegy(connection: RuleOptionConnection): Strategy {
  if ("databaseUrl" in connection) {
    return { type: "databaseUrl", ...connection };
  }

  if ("migrationsDir" in connection) {
    const DEFAULT_CONNECTION_URL = "postgres://postgres:postgres@localhost:5432/postgres";

    return { type: "migrations", connectionUrl: DEFAULT_CONNECTION_URL, ...connection };
  }

  return match(connection).exhaustive();
}
