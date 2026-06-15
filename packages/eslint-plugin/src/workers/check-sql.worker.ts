import {
  createGenerator,
  GenerateError,
  GenerateResult,
  SchemaIntrospectionResult,
} from "@ts-safeql/generate";
import {
  DatabaseInitializationError,
  IdentiferCase,
  InternalError,
  InvalidMigrationError,
  InvalidMigrationsPathError,
  PluginError,
  QuerySourceMapEntry,
} from "@ts-safeql/shared";
import path from "path";
import { runAsWorker } from "synckit";
import { match } from "ts-pattern";
import { createConnectionManager, type ConnectionPayload } from "@ts-safeql/connection-manager";
import {
  getConnectionStartegyByRuleOptionConnection,
  getMigrationDatabaseMetadata,
  isWatchMigrationsDirEnabled,
  runMigrations,
} from "../rules/check-sql.utils";
import { ConnectionTarget, RuleOptionConnection } from "../rules/RuleOptions";
import { J, pipe, TE } from "../utils/fp-ts";
import { initDatabase } from "../utils/pg.utils";
import { createWatchManager } from "../utils/watch-manager";

export interface CheckSQLWorkerParams {
  mode?: "query";
  connection: RuleOptionConnection;
  target: ConnectionTarget;
  query: { text: string; sourcemaps: QuerySourceMapEntry[] };
  projectDir: string;
}

export interface IntrospectSchemaWorkerParams {
  mode: "introspect-schema";
  connection: RuleOptionConnection;
  projectDir: string;
  fieldTransform: IdentiferCase | undefined;
  /** Restrict introspection to these schemas (defaults to all non-system schemas). */
  schemas?: string[];
  /** Table names to exclude (e.g. the migrations bookkeeping table). */
  excludeTables?: string[];
}

export type WorkerParams = CheckSQLWorkerParams | IntrospectSchemaWorkerParams;

export type CheckSQLWorkerHandler = typeof handler;

const generator = createGenerator();
const connections = createConnectionManager();
const watchers = createWatchManager();

export async function handler(params: WorkerParams) {
  const strategy = getConnectionStartegyByRuleOptionConnection({
    connection: params.connection,
    projectDir: params.projectDir,
  });

  if (isWatchMigrationsDirEnabled(params.connection)) {
    watchers.watchMigrationsDir({
      connection: params.connection,
      projectDir: params.projectDir,
      dropCacheKeyFn: generator.dropCacheKey,
      closeConnectionFn: () => connections.close(strategy),
    });
  }

  const task =
    params.mode === "introspect-schema" ? introspectSchemaHandler(params) : workerHandler(params);

  const result = await task();

  if (params.connection.keepAlive === false) {
    connections.close(strategy);
  }

  return J.stringify(result);
}

runAsWorker(handler);

export type WorkerError =
  | InvalidMigrationsPathError
  | InvalidMigrationError
  | InternalError
  | PluginError
  | DatabaseInitializationError
  | GenerateError;
export type WorkerResult = GenerateResult;
export type IntrospectSchemaWorkerResult = SchemaIntrospectionResult;

/**
 * Resolve the connection payload (the `sql` client + cache key) for a config,
 * creating and migrating the shadow database on first use. Shared by the query
 * (`generate`) and schema-introspection paths so both hit the same DB.
 */
function resolveConnectionPayload(params: {
  connection: RuleOptionConnection;
  projectDir: string;
}): TE.TaskEither<WorkerError, ConnectionPayload> {
  const strategy = getConnectionStartegyByRuleOptionConnection(params);

  return match(strategy)
    .with({ type: "databaseUrl" }, ({ databaseUrl }) =>
      TE.right(connections.getOrCreate(databaseUrl)),
    )
    .with({ type: "pluginsOnly" }, ({ plugins }) =>
      TE.tryCatch(
        () => connections.getOrCreateFromPlugins(plugins, params.projectDir),
        (error) => (error instanceof PluginError ? error : PluginError.from("unknown")(error)),
      ),
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

        // A plugin may provide its own migration runner (e.g. an ORM's TS
        // migrations). When present it replaces the built-in `.sql` runner.
        // Plugin resolution can throw synchronously (e.g. an unresolvable
        // package), so surface that as a worker error rather than crashing.
        let pluginMigrate: ReturnType<typeof connections.resolveMigrate>;
        try {
          pluginMigrate = params.connection.plugins?.length
            ? connections.resolveMigrate(params.connection.plugins, params.projectDir)
            : undefined;
        } catch (error) {
          return TE.left(error instanceof PluginError ? error : PluginError.from("unknown")(error));
        }

        const applyMigrations: TE.TaskEither<WorkerError, unknown> = pluginMigrate
          ? TE.tryCatch(
              () =>
                pluginMigrate.handler({
                  databaseUrl,
                  sql,
                  migrationsDir: migrationsPath,
                  projectDir: params.projectDir,
                }),
              PluginError.from(pluginMigrate.pluginName),
            )
          : runMigrations({ migrationsPath, sql });

        return pipe(
          TE.Do,
          TE.chainW(() => initDatabase(migrationSql, connectionOptions.database)),
          TE.chainW(() => applyMigrations),
          TE.map(() => connectionPayload),
        );
      }

      return TE.right(connectionPayload);
    })
    .exhaustive();
}

function workerHandler(params: CheckSQLWorkerParams): TE.TaskEither<WorkerError, WorkerResult> {
  return pipe(
    resolveConnectionPayload(params),
    TE.chainW(({ sql, databaseUrl, pluginName }) => {
      return TE.tryCatch(
        () =>
          generator.generate({
            sql,
            query: params.query,
            cacheKey: databaseUrl,
            overrides: params.connection.overrides,
            fieldTransform: params.target.fieldTransform,
          }),
        (e) => (pluginName ? PluginError.from(pluginName)(e) : InternalError.to(e)),
      );
    }),
    TE.chainW(TE.fromEither),
  );
}

function introspectSchemaHandler(
  params: IntrospectSchemaWorkerParams,
): TE.TaskEither<WorkerError, IntrospectSchemaWorkerResult> {
  return pipe(
    resolveConnectionPayload(params),
    TE.chainW(({ sql, databaseUrl, pluginName }) =>
      TE.tryCatch(
        () =>
          generator.introspectSchema({
            sql,
            cacheKey: databaseUrl,
            overrides: params.connection.overrides,
            fieldTransform: params.fieldTransform,
            schemas: params.schemas,
            excludeTables: params.excludeTables,
          }),
        (e) => (pluginName ? PluginError.from(pluginName)(e) : InternalError.to(e)),
      ),
    ),
  );
}
