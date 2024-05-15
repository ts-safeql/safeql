import { DatabaseInitializationError } from "@ts-safeql/shared";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import pgConnectionString from "pg-connection-string";
import { pipe, TE } from "./fp-ts";

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

export function initDatabase(connection: ConnectionOptions) {
  return pipe(
    TE.Do,
    TE.chain(() => dropDatabase(connection)),
    TE.altW(() => TE.right(undefined)),
    TE.chain(() => createDatabase(connection)),
  );
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
    },
  );

  return execToTaskEither(exec, DatabaseInitializationError.to);
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
      "--force",
    ],
    {
      env: { ...process.env, PGPASSWORD: connection.password },
    },
  );

  return execToTaskEither(exec, DatabaseInitializationError.to);
}

function execToTaskEither<L extends Error>(
  exec: ChildProcessWithoutNullStreams,
  mapLeft: (error: unknown) => L,
) {
  return TE.tryCatch(
    () =>
      new Promise<void>((resolve, reject) => {
        exec.stderr.on("data", (x) => reject(new Error(x)));
        exec.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(code + ""))));
      }),
    mapLeft,
  );
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
