import { isDefined } from "@ts-safeql/shared";
import { spawn } from "child_process";
import { nanoid } from "nanoid";
import { parse } from "pg-connection-string";
import postgres from "postgres";

interface ConnectionOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function mapConnectionOptionsToString(connectionOptions: ConnectionOptions): string {
  return `postgres://${connectionOptions.user}:${connectionOptions.password}@${connectionOptions.host}:${connectionOptions.port}/${connectionOptions.database}`;
}

export async function setupTestDatabase(params: { databaseName: string; postgresUrl: string }) {
  const connection = {
    ...parseConnection(params.postgresUrl),
    database: params.databaseName,
  };
  const drop = () => dropDatabase(connection);
  const sql = postgres(connection);

  await initDatabase(connection);

  const databaseUrl = mapConnectionOptionsToString(connection);

  return { drop, sql, databaseUrl: databaseUrl, databaseName: params.databaseName };
}

export function generateTestDatabaseName() {
  return `safeql_test_${nanoid()}`;
}

function parseConnection(databaseUrl: string): ConnectionOptions {
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

async function initDatabase(connection: ConnectionOptions) {
  try {
    try {
      await dropDatabase(connection);
    } catch {
      // do nothing
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

function createDatabase(connection: ConnectionOptions) {
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
    },
  );

  return new Promise((resolve, reject) => {
    exec.stderr.on("data", (x) => reject(x.toString()));
    exec.on("exit", (code) => (code === 0 ? resolve(code) : reject(code)));
  });
}

function dropDatabase(connection: ConnectionOptions) {
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
    ],
    {
      env: { ...process.env, PGPASSWORD: connection.password },
    },
  );

  return new Promise<number>((resolve, reject) => {
    exec.stderr.on("data", (x) => reject(x.toString()));
    exec.on("exit", (code) => (code === 0 ? resolve(code) : reject(code)));
  });
}
