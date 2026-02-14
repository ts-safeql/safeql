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
import path from "path";
import { runAsWorker } from "synckit";
import { match } from "ts-pattern";
import {
  ConnectionPayload,
  getConnectionStartegyByRuleOptionConnection,
  getMigrationDatabaseMetadata,
  isWatchMigrationsDirEnabled,
  runMigrations,
} from "../rules/check-sql.utils";
import { ConnectionTarget, RuleOptionConnection } from "../rules/RuleOptions";
import { createConnectionManager } from "../utils/connection-manager";
import { J, pipe, TE } from "../utils/fp-ts";
import { initDatabase } from "../utils/pg.utils";
import { createWatchManager } from "../utils/watch-manager";

export interface CheckSQLWorkerParams {
  connection: RuleOptionConnection;
  target: ConnectionTarget;
  query: { text: string; sourcemaps: QuerySourceMapEntry[] };
  projectDir: string;
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
  const driver = params.connection.driver ?? "postgres";

  const connnectionPayload = match(strategy)
    .with({ type: "databaseUrl" }, ({ databaseUrl }) =>
      TE.tryCatch(
        () => connections.getOrCreate(driver, databaseUrl),
        (error) => new InternalError(`Failed to create database connection: ${error}`),
      ),
    )
    .with({ type: "migrations" }, ({ migrationsDir, databaseName, connectionUrl }) =>
      TE.tryCatch(
        async () => {
          const { connectionOptions, databaseUrl } = getMigrationDatabaseMetadata({
            connectionUrl,
            databaseName,
          });
          const { sql, isFirst, dbConnection } = await connections.getOrCreate(driver, databaseUrl);
          const { sql: migrationSql } = await connections.getOrCreate(driver, connectionUrl, {
            onnotice: () => {
              /* silence notices */
            },
          });
          const connectionPayload: ConnectionPayload = { sql, isFirst, databaseUrl, dbConnection };

          if (isFirst) {
            if (!sql || !migrationSql) {
              throw new InternalError("SQL connection is not available for migrations");
            }
            const migrationsPath = path.join(params.projectDir, migrationsDir);
            await initDatabase(migrationSql, connectionOptions.database)();
            const migrationResult = await runMigrations({ migrationsPath, sql })();
            if (migrationResult._tag === "Left") {
              throw migrationResult.left;
            }
          }

          return connectionPayload;
        },
        (error) => new InternalError(`Failed to setup migrations: ${error}`),
      ),
    )
    .exhaustive();

  const generateTask = (params: GenerateParams) => {
    return TE.tryCatch(() => generator.generate(params), InternalError.to);
  };

  return pipe(
    connnectionPayload,
    TE.chainW(({ sql, databaseUrl, dbConnection }) => {
      switch (driver) {
        case "mysql": {
          if (!dbConnection) {
            throw new InternalError("Database connection is not available for MySQL");
          }
          return generateTask({
            driver: "mysql",
            dbConnection: dbConnection!,
            query: params.query,
            cacheKey: databaseUrl,
            overrides: params.connection.overrides,
            fieldTransform: params.target.fieldTransform,
          });
        }
        case "postgres": {
          if (!sql) {
            throw new InternalError("SQL connection is not available for PostgreSQL");
          }
          return generateTask({
            driver: "postgres",
            sql,
            query: params.query,
            cacheKey: databaseUrl,
            overrides: params.connection.overrides,
            fieldTransform: params.target.fieldTransform,
          });
        }
      }
    }),
    TE.chainW(TE.fromEither),
  );
}
