import { generate } from "@safeql/generate";
import { GenerateError, GenerateParams, GenerateResult } from "@safeql/generate/src/generate";
import {
  DatabaseInitializationError,
  InternalError,
  InvalidMigrationError,
  InvalidMigrationsPathError,
} from "@safeql/shared";
import { either, json, option, taskEither } from "fp-ts";
import { pipe } from "fp-ts/lib/function";
import { TaskEither } from "fp-ts/lib/TaskEither";
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

runAsWorker(async (params: WorkerParams) => {
  const result = await pipe(
    taskEither.Do,
    taskEither.chain(() => workerHandler(params))
  )();

  if (params.connection.keepAlive === false) {
    closeConnection(params.connection);
  }

  return json.stringify(result);
});

export type WorkerError =
  | InvalidMigrationsPathError
  | InvalidMigrationError
  | InternalError
  | DatabaseInitializationError
  | GenerateError;
export type WorkerResult = GenerateResult;

function workerHandler(params: WorkerParams): TaskEither<WorkerError, WorkerResult> {
  const strategy = mapRuleOptionsToStartegy(params.connection);

  const connnectionPayload = match(strategy)
    .with({ type: "databaseUrl" }, ({ databaseUrl }) =>
      taskEither.right(getOrCreateConnection(databaseUrl))
    )
    .with({ type: "migrations" }, ({ migrationsDir, databaseName, connectionUrl }) => {
      const connectionOptions = { ...parseConnection(connectionUrl), database: databaseName };
      const databaseUrl = mapConnectionOptionsToString(connectionOptions);
      const { sql, isFirst } = getOrCreateConnection(databaseUrl);
      const connectionPayload: ConnectionPayload = { sql, isFirst, databaseUrl };

      if (isFirst) {
        const migrationsPath = path.join(params.projectDir, migrationsDir);

        return pipe(
          taskEither.Do,
          taskEither.chainW(() => initDatabase(connectionOptions)),
          taskEither.chainW(() => runMigrations({ migrationsPath, sql })),
          taskEither.map(() => connectionPayload)
        );
      }

      return taskEither.right(connectionPayload);
    })
    .exhaustive();

  const generateTask = (params: GenerateParams) => {
    return taskEither.tryCatch(() => {
      return generate(params);
    }, InternalError.to);
  };

  return pipe(
    connnectionPayload,
    taskEither.chainW(({ sql, databaseUrl }) => {
      return generateTask({ sql, query: params.query, cacheKey: databaseUrl });
    }),
    taskEither.chainW(taskEither.fromEither)
  );
}

interface ConnectionPayload {
  sql: SQL;
  databaseUrl: string;
  isFirst: boolean;
}

function getOrCreateConnection(databaseUrl: string): ConnectionPayload {
  return pipe(
    connections.get(databaseUrl),
    option.fromNullable,
    option.foldW(
      () => {
        const sql = postgres(databaseUrl);
        connections.set(databaseUrl, sql);
        return { sql: sql, databaseUrl, isFirst: true };
      },
      (sql) => ({ sql, databaseUrl, isFirst: false })
    )
  );
}

function runMigrations(params: { migrationsPath: string; sql: SQL }) {
  const runSingleMigrationFileWithSql = (file: string) =>
    runSingleMigrationFile(params.sql, path.join(params.migrationsPath, file));

  return pipe(
    taskEither.Do,
    taskEither.chain(() => getMigrationFiles(params.migrationsPath)),
    taskEither.chainW((files) => {
      return taskEither.sequenceSeqArray(files.map(runSingleMigrationFileWithSql));
    })
  );
}

function getMigrationFiles(migrationsPath: string) {
  return pipe(
    taskEither.tryCatch(() => fs.promises.readdir(migrationsPath), either.toError),
    taskEither.map((files) => files.filter((file) => file.endsWith(".sql"))),
    taskEither.mapLeft(InvalidMigrationsPathError.fromErrorC(migrationsPath))
  );
}

function runSingleMigrationFile(sql: SQL, filePath: string) {
  return pipe(
    taskEither.tryCatch(
      () => fs.promises.readFile(filePath).then((x) => x.toString()),
      either.toError
    ),
    taskEither.chain((content) => taskEither.tryCatch(() => sql.unsafe(content), either.toError)),
    taskEither.mapLeft(InvalidMigrationError.fromErrorC(filePath))
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

function closeConnection(connection: RuleOptionConnection) {
  const strategy = mapRuleOptionsToStartegy(connection);

  match(strategy)
    .with({ type: "databaseUrl" }, ({ databaseUrl }) => {
      const sql = connections.get(databaseUrl);
      if (sql) {
        sql.end();
        connections.delete(databaseUrl);
      }
    })
    .with({ type: "migrations" }, ({ connectionUrl, databaseName }) => {
      const connectionOptions = { ...parseConnection(connectionUrl), database: databaseName };
      const databaseUrl = mapConnectionOptionsToString(connectionOptions);
      const sql = connections.get(databaseUrl);
      if (sql) {
        sql.end();
        connections.delete(databaseUrl);
      }
    })
    .exhaustive();
}
