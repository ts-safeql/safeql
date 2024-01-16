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
  LibPgQueryAST,
} from "@ts-safeql/shared";
import path from "path";
import { runAsWorker } from "synckit";
import { match } from "ts-pattern";
import { createConnectionManager } from "../utils/connection-manager";
import { J, pipe, TE } from "../utils/fp-ts";
import { initDatabase } from "../utils/pg.utils";
import { createWatchManager } from "../utils/watch-manager";
import { ConnectionTarget, RuleOptionConnection } from "./check-sql.rule";
import {
  ConnectionPayload,
  getMigrationDatabaseMetadata,
  isWatchMigrationsDirEnabled,
  getConnectionStartegyByRuleOptionConnection,
  runMigrations,
} from "./check-sql.utils";

export interface WorkerParams {
  connection: RuleOptionConnection;
  target: ConnectionTarget;
  query: string;
  projectDir: string;
  pgParsed: LibPgQueryAST.ParseResult;
}

const generator = createGenerator();
const connections = createConnectionManager();
const watchers = createWatchManager();

runAsWorker(async (params: WorkerParams) => {
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
});

export type WorkerError =
  | InvalidMigrationsPathError
  | InvalidMigrationError
  | InternalError
  | DatabaseInitializationError
  | GenerateError;
export type WorkerResult = GenerateResult;

function workerHandler(params: WorkerParams): TE.TaskEither<WorkerError, WorkerResult> {
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
      const connectionPayload: ConnectionPayload = { sql, isFirst, databaseUrl };

      if (isFirst) {
        const migrationsPath = path.join(params.projectDir, migrationsDir);

        return pipe(
          TE.Do,
          TE.chainW(() => initDatabase(connectionOptions)),
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
        nullAsUndefined: params.connection.nullAsUndefined,
        nullAsOptional: params.connection.nullAsOptional,
      });
    }),
    TE.chainW(TE.fromEither),
  );
}
