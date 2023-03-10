import chokidar from "chokidar";
import path from "path";
import { z } from "zod";
import { connectByMigrationSchema, RuleOptionConnection } from "../rules/check-sql.rule";
import {
  DEFAULT_CONNECTION_URL,
  getDatabaseName,
  getMigrationDatabaseMetadata,
} from "../rules/check-sql.utils";
import { CloseConnectionParams } from "./connection-manager";

export function createWatchManager() {
  const watchers: Map<string, unknown> = new Map();

  return {
    watchMigrationsDir: (params: WatchMigrationsDirParams) => watchMigrationsDir(params, watchers),
  };
}

interface WatchMigrationsDirParams {
  projectDir: string;
  connection: RuleOptionConnection & z.infer<typeof connectByMigrationSchema> & { watchMode: true };
  dropCacheKeyFn: (cacheKey: string) => void;
  closeConnectionFn: (params: CloseConnectionParams) => void;
}

export function watchMigrationsDir(
  params: WatchMigrationsDirParams,
  watchers: Map<string, unknown>
) {
  const migrationsPath = path.join(params.projectDir, params.connection.migrationsDir);

  if (watchers.has(migrationsPath)) {
    return;
  }

  const { databaseUrl } = getMigrationDatabaseMetadata({
    connectionUrl: params.connection.connectionUrl ?? DEFAULT_CONNECTION_URL,
    databaseName: getDatabaseName({
      databaseName: params.connection.databaseName,
      migrationsDir: params.connection.migrationsDir,
      projectDir: params.projectDir,
    }),
  });

  const watcher = chokidar.watch(migrationsPath, { ignoreInitial: true }).on("all", () => {
    params.dropCacheKeyFn(databaseUrl);
    params.closeConnectionFn({ connection: params.connection, projectDir: params.projectDir });
  });

  watchers.set(migrationsPath, watcher);
}
