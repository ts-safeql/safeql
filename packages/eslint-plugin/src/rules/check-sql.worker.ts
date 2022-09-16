import { generate } from "@ts-safeql/generate";
import { GenerateError, GenerateParams, GenerateResult } from "@ts-safeql/generate/src/generate";
import {
  DatabaseInitializationError,
  InternalError,
  InvalidMigrationError,
  InvalidMigrationsPathError,
  ParsedQuery,
} from "@ts-safeql/shared";
import fs from "fs";
import path from "path";
import postgres, { Sql } from "postgres";
import { runAsWorker } from "synckit";
import { match } from "ts-pattern";
import { E, J, O, pipe, TE } from "../utils/fp-ts";
import { initDatabase, mapConnectionOptionsToString, parseConnection } from "../utils/pg.utils";
import { RuleOptionConnection } from "./check-sql.rule";

type SQL = Sql<Record<string, unknown>>;

const connections: Map<string, SQL> = new Map();

export interface WorkerParams {
  connection: RuleOptionConnection;
  query: string;
  projectDir: string;
  pgParsed: ParsedQuery.Root;
}

runAsWorker(async (params: WorkerParams) => {
  const result = await pipe(
    TE.Do,
    TE.chain(() => workerHandler(params))
  )();

  if (params.connection.keepAlive === false) {
    closeConnection(params.connection);
  }

  return J.stringify(result);
});

export type WorkerError =
  | InvalidMigrationsPathError
  | InvalidMigrationError
  | InternalError
  | DatabaseInitializationError
  | GenerateError;
export type WorkerResult = GenerateResult;

function workerHandler(params: WorkerParams): TE.TaskEither<WorkerError, WorkerResult> {
  const strategy = mapRuleOptionsToStartegy(params.connection);

  const connnectionPayload = match(strategy)
    .with({ type: "databaseUrl" }, ({ databaseUrl }) =>
      TE.right(getOrCreateConnection(databaseUrl))
    )
    .with({ type: "migrations" }, ({ migrationsDir, databaseName, connectionUrl }) => {
      const connectionOptions = { ...parseConnection(connectionUrl), database: databaseName };
      const databaseUrl = mapConnectionOptionsToString(connectionOptions);
      const { sql, isFirst } = getOrCreateConnection(databaseUrl);
      const connectionPayload: ConnectionPayload = { sql, isFirst, databaseUrl };

      if (isFirst) {
        const migrationsPath = path.join(params.projectDir, migrationsDir);

        return pipe(
          TE.Do,
          TE.chainW(() => initDatabase(connectionOptions)),
          TE.chainW(() => runMigrations({ migrationsPath, sql })),
          TE.map(() => connectionPayload)
        );
      }

      return TE.right(connectionPayload);
    })
    .exhaustive();

  const generateTask = (params: GenerateParams) => {
    return TE.tryCatch(() => {
      return generate(params);
    }, InternalError.to);
  };

  return pipe(
    connnectionPayload,
    TE.chainW(({ sql, databaseUrl }) => {
      return generateTask({
        sql,
        query: params.query,
        cacheKey: databaseUrl,
        pgParsed: params.pgParsed,
      });
    }),
    TE.chainW(TE.fromEither)
  );
}

interface ConnectionPayload {
  sql: SQL;
  databaseUrl: string;
  isFirst: boolean;
}

function getOrCreateConnection(databaseUrl: string): ConnectionPayload {
  return pipe(
    O.fromNullable(connections.get(databaseUrl)),
    O.foldW(
      () => {
        const sql = postgres(databaseUrl);
        connections.set(databaseUrl, sql);
        return { sql: sql, databaseUrl, isFirst: true };
      },
      (sql) => ({ sql, databaseUrl, isFirst: false })
    )
  );
}

function runMigrations(params: { migrationsPath: string; sql: SQL }) {
  const runSingleMigrationFileWithSql = (filePath: string) => {
    return runSingleMigrationFile(params.sql, filePath);
  };

  return pipe(
    TE.Do,
    TE.chain(() => getMigrationFiles(params.migrationsPath)),
    TE.chainW((files) => TE.sequenceSeqArray(files.map(runSingleMigrationFileWithSql)))
  );
}

function findDeepSqlFiles(migrationsPath: string) {
  const sqlFilePaths: string[] = [];

  function findDeepSqlFilesRecursively(dir: string) {
    const files = fs.readdirSync(dir);

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      const isDirectory = fs.statSync(filePath).isDirectory();

      if (isDirectory) {
        findDeepSqlFilesRecursively(filePath);
      } else if (filePath.endsWith(".sql")) {
        sqlFilePaths.push(filePath);
      }
    });
  }

  findDeepSqlFilesRecursively(migrationsPath);

  return sqlFilePaths;
}

function getMigrationFiles(migrationsPath: string) {
  return pipe(
    E.tryCatch(() => findDeepSqlFiles(migrationsPath), E.toError),
    TE.fromEither,
    TE.mapLeft(InvalidMigrationsPathError.fromErrorC(migrationsPath))
  );
}

function runSingleMigrationFile(sql: SQL, filePath: string) {
  return pipe(
    TE.tryCatch(() => fs.promises.readFile(filePath).then((x) => x.toString()), E.toError),
    TE.chain((content) => TE.tryCatch(() => sql.unsafe(content), E.toError)),
    TE.mapLeft(InvalidMigrationError.fromErrorC(filePath))
  );
}

type Strategy =
  | {
      type: "databaseUrl";
      databaseUrl: string;
    }
  | {
      type: "migrations";
      migrationsDir: string;
      connectionUrl: string;
      databaseName: string;
    };

function mapRuleOptionsToStartegy(connection: RuleOptionConnection): Strategy {
  if ("databaseUrl" in connection) {
    return { type: "databaseUrl", ...connection };
  }

  if ("migrationsDir" in connection) {
    const DEFAULT_CONNECTION_URL = "postgres://postgres:postgres@localhost:5432/postgres";

    return { type: "migrations", connectionUrl: DEFAULT_CONNECTION_URL, ...connection };
  }

  return match(connection).exhaustive();
}

function closeConnection(connection: RuleOptionConnection) {
  const strategy = mapRuleOptionsToStartegy(connection);

  match(strategy)
    .with({ type: "databaseUrl" }, ({ databaseUrl }) => {
      const sql = connections.get(databaseUrl);
      if (sql) {
        sql.end();
        connections.delete(databaseUrl);
      }
    })
    .with({ type: "migrations" }, ({ connectionUrl, databaseName }) => {
      const connectionOptions = { ...parseConnection(connectionUrl), database: databaseName };
      const databaseUrl = mapConnectionOptionsToString(connectionOptions);
      const sql = connections.get(databaseUrl);
      if (sql) {
        sql.end();
        connections.delete(databaseUrl);
      }
    })
    .exhaustive();
}
