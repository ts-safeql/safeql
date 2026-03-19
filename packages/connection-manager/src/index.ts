import { PluginManager } from "@ts-safeql/plugin-utils";
import postgres, { Sql } from "postgres";
import { match } from "ts-pattern";
import { PluginError } from "@ts-safeql/shared";
import * as O from "fp-ts/lib/Option.js";
import { pipe } from "fp-ts/lib/function.js";
import { mapConnectionOptionsToString, parseConnection } from "./pg.utils";

export type { ConnectionOptions } from "./pg.utils";
export { parseConnection, mapConnectionOptionsToString } from "./pg.utils";

export interface ConnectionPayload {
  sql: Sql;
  databaseUrl: string;
  isFirst: boolean;
  pluginName?: string;
}

type PluginDescriptors = Array<{ package: string; config?: Record<string, unknown> }>;

export type ConnectionStrategy =
  | {
      type: "databaseUrl";
      databaseUrl: string;
      plugins?: PluginDescriptors;
    }
  | {
      type: "migrations";
      migrationsDir: string;
      connectionUrl: string;
      databaseName: string;
      watchMode: boolean;
      plugins?: PluginDescriptors;
    }
  | {
      type: "pluginsOnly";
      plugins: PluginDescriptors;
    };

export function createConnectionManager() {
  const connectionMap: Map<string, Sql> = new Map();
  const pluginManager = new PluginManager();

  return {
    getOrCreate: (databaseUrl: string, options?: postgres.Options<never>) =>
      getOrCreateConnection(databaseUrl, connectionMap, options),
    getOrCreateFromPlugins: (
      plugins: Array<{ package: string; config?: Record<string, unknown> }>,
      projectDir: string,
    ) => getOrCreateFromPlugins(plugins, connectionMap, pluginManager, projectDir),
    close: (strategy: ConnectionStrategy) =>
      closeConnection(strategy, connectionMap, pluginManager),
  };
}

function getOrCreateConnection(
  databaseUrl: string,
  connectionMap: Map<string, Sql>,
  options?: postgres.Options<never>,
): ConnectionPayload {
  return pipe(
    O.fromNullable(connectionMap.get(databaseUrl)),
    O.foldW(
      () => {
        const sql = postgres(databaseUrl, options);
        connectionMap.set(databaseUrl, sql);
        return { sql, databaseUrl, isFirst: true };
      },
      (sql) => ({ sql, databaseUrl, isFirst: false }),
    ),
  );
}

async function getOrCreateFromPlugins(
  plugins: Array<{ package: string; config?: Record<string, unknown> }>,
  connectionMap: Map<string, Sql>,
  pluginManager: PluginManager,
  projectDir: string,
): Promise<ConnectionPayload> {
  let connection;
  try {
    connection = await pluginManager.resolveConnection(plugins, projectDir);
  } catch (error) {
    throw PluginError.from("plugin-resolution")(error);
  }

  if (!connection) {
    throw new PluginError(
      "plugin-resolution",
      "None of the loaded SafeQL plugins provide a createConnection hook.",
    );
  }

  const { cacheKey, handler, pluginName } = connection;

  const existing = connectionMap.get(cacheKey);
  if (existing) {
    return { sql: existing, databaseUrl: cacheKey, isFirst: false, pluginName };
  }

  try {
    const sql = await handler();
    connectionMap.set(cacheKey, sql);
    return { sql, databaseUrl: cacheKey, isFirst: true, pluginName };
  } catch (error) {
    throw PluginError.from(pluginName)(error);
  }
}

function closeConnection(
  strategy: ConnectionStrategy,
  connectionMap: Map<string, Sql>,
  pluginManager: PluginManager,
) {
  match(strategy)
    .with({ type: "databaseUrl" }, ({ databaseUrl }) => {
      const sql = connectionMap.get(databaseUrl);
      if (sql) {
        sql.end();
        connectionMap.delete(databaseUrl);
      }
    })
    .with({ type: "migrations" }, ({ connectionUrl, databaseName }) => {
      const connectionOptions = { ...parseConnection(connectionUrl), database: databaseName };
      const databaseUrl = mapConnectionOptionsToString(connectionOptions);
      const sql = connectionMap.get(databaseUrl);
      const migrationSql = connectionMap.get(connectionUrl);
      if (sql) {
        sql.end();
        connectionMap.delete(databaseUrl);
      }
      if (migrationSql) {
        migrationSql.end();
        connectionMap.delete(connectionUrl);
      }
    })
    .with({ type: "pluginsOnly" }, ({ plugins }) => {
      const cached = pluginManager.getCachedConnection(plugins);

      if (cached) {
        const sql = connectionMap.get(cached.cacheKey);
        if (sql) {
          sql.end();
          connectionMap.delete(cached.cacheKey);
        }
      }

      pluginManager.evictPlugins(plugins);
    })
    .exhaustive();
}
