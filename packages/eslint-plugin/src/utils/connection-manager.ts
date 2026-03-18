import { PluginManager } from "@ts-safeql/plugin-utils";
import postgres, { Sql } from "postgres";
import { match } from "ts-pattern";
import { PluginError } from "@ts-safeql/shared";
import { RuleOptionConnection } from "../rules/RuleOptions";
import {
  ConnectionPayload,
  getConnectionStartegyByRuleOptionConnection,
} from "../rules/check-sql.utils";
import { O, pipe } from "./fp-ts";
import { mapConnectionOptionsToString, parseConnection } from "./pg.utils";

export function createConnectionManager() {
  const connectionMap: Map<string, Sql> = new Map();
  const pluginManager = new PluginManager();

  return {
    getOrCreate: (databaseUrl: string, options?: postgres.Options<never>) =>
      getOrCreateConnection(databaseUrl, connectionMap, options),
    getOrCreateFromPlugins: (
      plugins: Array<{ package: string; config: Record<string, unknown> }>,
      projectDir: string,
    ) => getOrCreateFromPlugins(plugins, connectionMap, pluginManager, projectDir),
    close: (params: CloseConnectionParams) => closeConnection(params, connectionMap, pluginManager),
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
  plugins: Array<{ package: string; config: Record<string, unknown> }>,
  connectionMap: Map<string, Sql>,
  pluginManager: PluginManager,
  projectDir: string,
): Promise<ConnectionPayload> {
  const connection = await pluginManager.resolveConnection(plugins, projectDir);

  if (!connection) {
    throw new Error("None of the loaded SafeQL plugins provide a createConnection hook.");
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

export interface CloseConnectionParams {
  connection: RuleOptionConnection;
  projectDir: string;
}

function closeConnection(
  params: CloseConnectionParams,
  connectionMap: Map<string, Sql>,
  pluginManager: PluginManager,
) {
  const { connection, projectDir } = params;
  const strategy = getConnectionStartegyByRuleOptionConnection({ connection, projectDir });

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
