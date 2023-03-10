import postgres, { Sql } from "postgres";
import { match } from "ts-pattern";
import { RuleOptionConnection } from "../rules/check-sql.rule";
import {
  ConnectionPayload,
  getConnectionStartegyByRuleOptionConnection,
} from "../rules/check-sql.utils";
import { pipe, O } from "./fp-ts";
import { parseConnection, mapConnectionOptionsToString } from "./pg.utils";

export function createConnectionManager() {
  const connectionMap: Map<string, Sql> = new Map();

  return {
    getOrCreate: (databaseUrl: string) => getOrCreateConnection(databaseUrl, connectionMap),
    close: (params: CloseConnectionParams) => closeConnection(params, connectionMap),
  };
}

function getOrCreateConnection(
  databaseUrl: string,
  connectionMap: Map<string, Sql>
): ConnectionPayload {
  return pipe(
    O.fromNullable(connectionMap.get(databaseUrl)),
    O.foldW(
      () => {
        const sql = postgres(databaseUrl);
        connectionMap.set(databaseUrl, sql);
        return { sql, databaseUrl, isFirst: true };
      },
      (sql) => ({ sql, databaseUrl, isFirst: false })
    )
  );
}

export interface CloseConnectionParams {
  connection: RuleOptionConnection;
  projectDir: string;
}

function closeConnection(params: CloseConnectionParams, connectionMap: Map<string, Sql>) {
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
      if (sql) {
        sql.end();
        connectionMap.delete(databaseUrl);
      }
    })
    .exhaustive();
}
