import chokidar from "chokidar";
import path from "path";
import { z } from "zod";
import { RuleOptionConnection, zConnectionMigration } from "../rules/RuleOptions";
import {
  DEFAULT_CONNECTION_URL,
  getDatabaseName,
  getMigrationDatabaseMetadata,
} from "../rules/check-sql.utils";
import { CloseConnectionParams } from "./connection-manager";

interface WatchMigrationsDirParams {
  projectDir: string;
  connection: RuleOptionConnection & z.infer<typeof zConnectionMigration> & { watchMode: true };
  dropCacheKeyFn: (cacheKey: string) => void;
  closeConnectionFn: (params: CloseConnectionParams) => void;
}

export function createWatchManager() {
  const migrationPaths = new Map<string, { onChange: () => void }>();
  const watcher = chokidar.watch([], { ignoreInitial: true }).on("all", (_, filePath) => {
    for (const [path, { onChange }] of migrationPaths.entries()) {
      if (filePath.startsWith(path)) {
        return onChange();
      }
    }
  });

  const watchMigrationsDir = (params: WatchMigrationsDirParams) => {
    const migrationPath = path.join(params.projectDir, params.connection.migrationsDir);

    if (migrationPaths.has(migrationPath)) {
      return;
    }

    migrationPaths.set(migrationPath, {
      onChange: () => {
        const { databaseUrl } = getMigrationDatabaseMetadata({
          connectionUrl: params.connection.connectionUrl ?? DEFAULT_CONNECTION_URL,
          databaseName: getDatabaseName({
            databaseName: params.connection.databaseName,
            migrationsDir: params.connection.migrationsDir,
            projectDir: params.projectDir,
          }),
        });

        params.dropCacheKeyFn(databaseUrl);
        params.closeConnectionFn({ connection: params.connection, projectDir: params.projectDir });
      },
    });

    watcher.add(migrationPath);
  };

  return {
    watchMigrationsDir,
  };
}
