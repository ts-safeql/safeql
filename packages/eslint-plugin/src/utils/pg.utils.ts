import { spawn } from "child_process";
import { parse } from "pg-connection-string";

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
  const connection = parse(databaseUrl);

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

export async function initDatabase(connection: ConnectionOptions) {
  try {
    try {
      await dropDatabase(connection);
    } catch (x) {
      console.log(x);
    }
    await createDatabase(connection);
  } catch (e) {
    if (!(e instanceof Error)) {
      throw e;
    }

    console.log(-1);
    console.error("Failed initializing database:", e.toString());
  }
}

export function createDatabase(connection: ConnectionOptions) {
  const exec = spawn(
    "createdb",
    [
      connection.database,
      "-h",
      connection.host,
      "-p",
      connection.port.toString(),
      "-U",
      connection.user,
    ],
    {
      env: { ...process.env, PGPASSWORD: connection.password },
    }
  );

  return new Promise((resolve, reject) => {
    exec.stderr.on("data", (x) => reject(x.toString()));
    exec.on("exit", (code) => (code === 0 ? resolve(code) : reject(code)));
  });
}

export function dropDatabase(connection: ConnectionOptions) {
  const exec = spawn(
    "dropdb",
    [
      connection.database,
      "--if-exists",
      "-h",
      connection.host,
      "-p",
      connection.port.toString(),
      "-U",
      connection.user,
      "--force"
    ],
    {
      env: { ...process.env, PGPASSWORD: connection.password },
    }
  );

  return new Promise((resolve, reject) => {
    exec.stderr.on("data", (x) => reject(x.toString()));
    exec.on("exit", (code) => (code === 0 ? resolve(code) : reject(code)));
  });
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
