import postgres, { Sql } from "postgres";
import { match } from "ts-pattern";
import { RuleOptionConnection } from "../rules/RuleOptions";
import {
  ConnectionPayload,
  getConnectionStartegyByRuleOptionConnection,
} from "../rules/check-sql.utils";
import { mapConnectionOptionsToString, parseConnection } from "./pg.utils";
import {
  createDatabaseConnection,
  type IDatabaseConnection,
  PostgresConnection,
  type DatabaseDriver,
} from "@ts-safeql/generate";

export function createConnectionManager() {
  const connectionMap: Map<string, Sql> = new Map();
  const connectionAdapterMap: Map<string, IDatabaseConnection> = new Map();

  return {
    getOrCreate: (driver: DatabaseDriver, databaseUrl: string, options?: postgres.Options<never>) =>
      getOrCreateConnection(driver, databaseUrl, connectionMap, connectionAdapterMap, options),
    close: (params: CloseConnectionParams) =>
      closeConnection(params, connectionMap, connectionAdapterMap),
  };
}

async function getOrCreateConnection(
  driver: DatabaseDriver,
  databaseUrl: string,
  connectionMap: Map<string, Sql>,
  connectionAdapterMap: Map<string, IDatabaseConnection>,
  options?: postgres.Options<never>,
): Promise<ConnectionPayload> {
  const existingConnection = connectionAdapterMap.get(databaseUrl);

  // Return existing connection if available
  if (existingConnection) {
    const sql =
      existingConnection.driver === "postgres"
        ? (existingConnection as PostgresConnection).sql
        : undefined;
    return {
      sql,
      databaseUrl,
      isFirst: false,
      dbConnection: existingConnection,
    };
  }

  // Create new connection
  const connection = await createDatabaseConnection(driver, databaseUrl, options);
  connectionAdapterMap.set(databaseUrl, connection);
  switch (driver) {
    case "postgres": {
      const sql = (connection as PostgresConnection).sql;
      connectionMap.set(databaseUrl, sql);
      return { sql, databaseUrl, isFirst: true, dbConnection: connection };
    }
    case "mysql": {
      return {
        sql: undefined,
        databaseUrl,
        isFirst: true,
        dbConnection: connection,
      };
    }
  }
}

export interface CloseConnectionParams {
  connection: RuleOptionConnection;
  projectDir: string;
}

async function closeConnection(
  params: CloseConnectionParams,
  connectionMap: Map<string, Sql>,
  connectionAdapterMap: Map<string, IDatabaseConnection>,
) {
  const { connection, projectDir } = params;
  const strategy = getConnectionStartegyByRuleOptionConnection({ connection, projectDir });

  await match(strategy)
    .with({ type: "databaseUrl" }, async ({ databaseUrl }) => {
      const sql = connectionAdapterMap.get(databaseUrl);
      if (sql) {
        await sql.end();
        connectionAdapterMap.delete(databaseUrl);
        connectionMap.delete(databaseUrl);
      }
    })
    .with({ type: "migrations" }, async ({ connectionUrl, databaseName }) => {
      const connectionOptions = { ...parseConnection(connectionUrl), database: databaseName };
      const databaseUrl = mapConnectionOptionsToString(connectionOptions);

      const adapterConnection = connectionAdapterMap.get(databaseUrl);
      const migrationAdapterConnection = connectionAdapterMap.get(connectionUrl);

      if (adapterConnection) {
        await adapterConnection.end();
        connectionAdapterMap.delete(databaseUrl);
        connectionMap.delete(databaseUrl);
      }
      if (migrationAdapterConnection) {
        await migrationAdapterConnection.end();
        connectionAdapterMap.delete(connectionUrl);
        connectionMap.delete(connectionUrl);
      }
    })
    .exhaustive();
}
