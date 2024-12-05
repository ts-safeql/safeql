import {
  createGenerator,
  GenerateError,
  GenerateParams,
  GenerateResult,
} from "@ts-safeql/generate";
import {
  DatabaseInitializationError,
  InternalError,
  InvalidMigrationError,
  InvalidMigrationsPathError,
  QuerySourceMapEntry,
} from "@ts-safeql/shared";
import * as LibPgQueryAST from "@ts-safeql/sql-ast";
import path from "path";
import { runAsWorker } from "synckit";
import { match } from "ts-pattern";
import { createConnectionManager } from "../utils/connection-manager";
import { J, pipe, TE } from "../utils/fp-ts";
import { initDatabase } from "../utils/pg.utils";
import { createWatchManager } from "../utils/watch-manager";
import {
  ConnectionPayload,
  getConnectionStartegyByRuleOptionConnection,
  getMigrationDatabaseMetadata,
  isWatchMigrationsDirEnabled,
  runMigrations,
} from "../rules/check-sql.utils";
import { ConnectionTarget, RuleOptionConnection } from "../rules/RuleOptions";

export interface CheckSQLWorkerParams {
  connection: RuleOptionConnection;
  target: ConnectionTarget;
  query: { text: string; sourcemaps: QuerySourceMapEntry[] };
  projectDir: string;
  pgParsed: LibPgQueryAST.ParseResult;
}

export type CheckSQLWorkerHandler = typeof handler;

const generator = createGenerator();
const connections = createConnectionManager();
const watchers = createWatchManager();

async function handler(params: CheckSQLWorkerParams) {
  if (isWatchMigrationsDirEnabled(params.connection)) {
    watchers.watchMigrationsDir({
      connection: params.connection,
      projectDir: params.projectDir,
      dropCacheKeyFn: generator.dropCacheKey,
      closeConnectionFn: connections.close,
    });
  }

  const result = await pipe(
    TE.Do,
    TE.chain(() => workerHandler(params)),
  )();

  if (params.connection.keepAlive === false) {
    connections.close({ connection: params.connection, projectDir: params.projectDir });
  }

  return J.stringify(result);
}

runAsWorker(handler);

export type WorkerError =
  | InvalidMigrationsPathError
  | InvalidMigrationError
  | InternalError
  | DatabaseInitializationError
  | GenerateError;
export type WorkerResult = GenerateResult;

function workerHandler(params: CheckSQLWorkerParams): TE.TaskEither<WorkerError, WorkerResult> {
  const strategy = getConnectionStartegyByRuleOptionConnection(params);

  const connnectionPayload = match(strategy)
    .with({ type: "databaseUrl" }, ({ databaseUrl }) =>
      TE.right(connections.getOrCreate(databaseUrl)),
    )
    .with({ type: "migrations" }, ({ migrationsDir, databaseName, connectionUrl }) => {
      const { connectionOptions, databaseUrl } = getMigrationDatabaseMetadata({
        connectionUrl,
        databaseName,
      });
      const { sql, isFirst } = connections.getOrCreate(databaseUrl);
      const { sql: migrationSql } = connections.getOrCreate(connectionUrl, {
        onnotice: () => {
          /* silence notices */
        },
      });
      const connectionPayload: ConnectionPayload = { sql, isFirst, databaseUrl };

      if (isFirst) {
        const migrationsPath = path.join(params.projectDir, migrationsDir);

        return pipe(
          TE.Do,
          TE.chainW(() => initDatabase(migrationSql, connectionOptions.database)),
          TE.chainW(() => runMigrations({ migrationsPath, sql })),
          TE.map(() => connectionPayload),
        );
      }

      return TE.right(connectionPayload);
    })
    .exhaustive();

  const generateTask = (params: GenerateParams) => {
    return TE.tryCatch(() => generator.generate(params), InternalError.to);
  };

  return pipe(
    connnectionPayload,
    TE.chainW(({ sql, databaseUrl }) => {
      return generateTask({
        sql,
        query: params.query,
        cacheKey: databaseUrl,
        pgParsed: params.pgParsed,
        overrides: params.connection.overrides,
        fieldTransform: params.target.fieldTransform,
      });
    }),
    TE.chainW(TE.fromEither),
  );
}
