import pgConnectionString from "pg-connection-string";

export interface ConnectionOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function mapConnectionOptionsToString(connectionOptions: ConnectionOptions): string {
  const user = encodeURIComponent(connectionOptions.user);
  const password = encodeURIComponent(connectionOptions.password);
  return `postgres://${user}:${password}@${connectionOptions.host}:${connectionOptions.port}/${connectionOptions.database}`;
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
    throw new Error("Could not resolve database password");
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

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
