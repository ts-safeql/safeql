import { DatabaseInitializationError } from "@ts-safeql/shared";
import pgConnectionString from "pg-connection-string";
import { pipe, TE } from "./fp-ts";
import { Sql } from "postgres";

export interface ConnectionOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function mapConnectionOptionsToString(connectionOptions: ConnectionOptions): string {
  return `postgres://${connectionOptions.user}:${connectionOptions.password}@${connectionOptions.host}:${connectionOptions.port}/${connectionOptions.database}`;
}

export function parseConnection(databaseUrl: string): ConnectionOptions {
  const connection = pgConnectionString.parse(databaseUrl);

  if (connection.host === null) {
    throw new Error("Could not resolve database host");
  }

  if (!isDefined(connection.port)) {
    throw new Error("Could not resolve database port");
  }

  if (!isDefined(connection.user)) {
    throw new Error("Could not resolve database user");
  }

  if (!isDefined(connection.password)) {
    throw new Error("Could not resolve datbase password");
  }

  if (!isDefined(connection.database)) {
    throw new Error("Could not resolve database name");
  }

  return {
    host: connection.host,
    port: parseInt(connection.port, 10),
    user: connection.user,
    password: connection.password,
    database: connection.database,
  };
}

export function initDatabase(sql: Sql, database: string) {
  return pipe(
    TE.Do,
    TE.chain(() => dropDatabase(sql, database)),
    TE.altW(() => TE.right(undefined)),
    TE.chain(() => createDatabase(sql, database)),
  );
}

export function createDatabase(sql: Sql, database: string) {
  return TE.tryCatch(
    () => sql.unsafe(`CREATE DATABASE ${database}`),
    DatabaseInitializationError.to,
  );
}

export function dropDatabase(sql: Sql, database: string) {
  return TE.tryCatch(async () => {
    const [{ withForce }] = await sql.unsafe(`
        SELECT (string_to_array(version(), ' '))[2]::numeric >= 13 AS "withForce"
      `);

    return withForce
      ? sql.unsafe(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`)
      : sql.unsafe(`DROP DATABASE IF EXISTS ${database}`);
  }, DatabaseInitializationError.to);
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
