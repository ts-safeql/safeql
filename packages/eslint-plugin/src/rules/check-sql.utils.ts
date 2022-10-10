import { GenerateResult } from "@ts-safeql/generate";
import {
  DuplicateColumnsError,
  InvalidMigrationError,
  InvalidMigrationsPathError,
  InvalidQueryError,
  PostgresError,
} from "@ts-safeql/shared";
import { TSESTree } from "@typescript-eslint/utils";
import crypto from "crypto";
import { pipe } from "fp-ts/lib/function";
import fs from "fs";
import path from "path";
import { Sql } from "postgres";
import { match } from "ts-pattern";
import { z } from "zod";
import { ESTreeUtils } from "../utils";
import { E, TE } from "../utils/fp-ts";
import { mapConnectionOptionsToString, parseConnection } from "../utils/pg.utils";
import { connectByMigrationSchema, RuleContext, RuleOptionConnection } from "./check-sql.rule";
import { WorkerError } from "./check-sql.worker";

type TypeReplacerString = string;
type TypeReplacerFromTo = [string, string];
type TypeTransformer = TypeReplacerString | (TypeReplacerString | TypeReplacerFromTo)[];

export const DEFAULT_CONNECTION_URL = "postgres://postgres:postgres@localhost:5432/postgres";

function isReplacerFromTo(replacer: TypeTransformer[number]): replacer is TypeReplacerFromTo {
  return Array.isArray(replacer) && replacer.length === 2;
}

function transformType(typeString: string, typeReplacer: TypeTransformer[number]): string {
  return isReplacerFromTo(typeReplacer)
    ? typeString.replace(new RegExp(typeReplacer[0], "g"), typeReplacer[1])
    : typeReplacer.replace("{type}", typeString);
}

/**
 * Takes a generated result and a transform type and returns a result with the
 * transformed type.
 *
 * @param transform could be either:
 *  - a string that has {type} in it,
 *  - an array of tuples that behave as [valueToBeReplaced, typeToReplaceWith]
 *  - an array that has a mix of the above (such as ["{type}[]", ["colname", "x_colname"]])
 */
export function withTransformType(result: GenerateResult, transform?: TypeTransformer) {
  if (transform === undefined || result.result === null) {
    return result;
  }

  if (typeof transform === "string") {
    return { ...result, result: transformType(result.result, transform) };
  }

  const replacer = (() => {
    let transformed = result.result;

    for (const replacer of transform) {
      transformed = transformType(transformed, replacer);
    }

    return transformed;
  })();

  return { ...result, result: replacer };
}

export function reportInvalidQueryError(params: {
  context: RuleContext;
  error: InvalidQueryError;
}) {
  const { context, error } = params;

  return context.report({
    messageId: "invalidQuery",
    node: error.node,
    data: { error: error.message },
  });
}

export function reportBaseError(params: {
  context: RuleContext;
  tag: TSESTree.TaggedTemplateExpression;
  error: WorkerError;
}) {
  const { context, tag, error } = params;

  return context.report({
    node: tag,
    messageId: "error",
    data: {
      error: error.message,
    },
  });
}

export function reportDuplicateColumns(params: {
  tag: TSESTree.TaggedTemplateExpression;
  context: RuleContext;
  error: DuplicateColumnsError;
}) {
  const { tag, context, error } = params;

  return context.report({
    node: tag,
    messageId: "invalidQuery",
    loc: ESTreeUtils.getSourceLocationFromStringPosition({
      loc: tag.quasi.loc,
      position: error.queryText.search(error.columns[0]) + 1,
      value: error.queryText,
    }),
    data: {
      error: error.message,
    },
  });
}

export function reportPostgresError(params: {
  context: RuleContext;
  tag: TSESTree.TaggedTemplateExpression;
  error: PostgresError;
}) {
  const { context, tag, error } = params;

  return context.report({
    node: tag,
    messageId: "invalidQuery",
    loc: ESTreeUtils.getSourceLocationFromStringPosition({
      loc: tag.quasi.loc,
      position: parseInt(error.position, 10),
      value: error.queryText,
    }),
    data: {
      error: error.message,
    },
  });
}

export function reportMissingTypeAnnotations(params: {
  context: RuleContext;
  tag: TSESTree.TaggedTemplateExpression;
  baseNode: TSESTree.BaseNode;
  result: GenerateResult & { result: string };
}) {
  const { context, tag, baseNode, result } = params;

  return context.report({
    node: tag,
    messageId: "missingTypeAnnotations",
    loc: baseNode.loc,
    fix: (fixer) => fixer.insertTextAfterRange(baseNode.range, `<${result.result}>`),
    data: {
      fix: result.result,
    },
  });
}

export function reportIncorrectTypeAnnotations(params: {
  context: RuleContext;
  result: GenerateResult;
  typeParameter: TSESTree.TSTypeParameterInstantiation;
  expected: string | null;
  actual: string | null;
}) {
  const { context, result, typeParameter } = params;
  const newValue = result.result === null ? "" : `<${result.result}>`;

  return context.report({
    node: typeParameter.params[0],
    messageId: "incorrectTypeAnnotations",
    fix: (fixer) => fixer.replaceText(typeParameter, newValue),
    data: {
      expected: params.expected,
      actual: params.actual ?? "No type annotation",
    },
  });
}
export function reportInvalidTypeAnnotations(params: {
  context: RuleContext;
  typeParameter: TSESTree.TSTypeParameterInstantiation;
}) {
  const { context, typeParameter } = params;

  return context.report({
    node: typeParameter.params[0],
    messageId: "invalidTypeAnnotations",
  });
}

export function getDatabaseName(params: {
  databaseName: string | undefined;
  migrationsDir: string;
  projectDir: string;
}) {
  const { databaseName, projectDir, migrationsDir } = params;

  if (databaseName !== undefined) {
    return databaseName;
  }

  const projectDirName = projectDir.split("/").pop() ?? "";
  const projectUnderscoreName = projectDirName.replace(/[^A-z0-9]/g, "_").toLowerCase();
  const hash = crypto.createHash("sha1").update(migrationsDir).digest("hex").substring(0, 8);

  return `safeql_${projectUnderscoreName}_${hash}`;
}

export function shouldLintFile(params: RuleContext) {
  const fileName = params.getFilename();

  for (const extension of ["ts", "tsx", "mts", "mtsx"]) {
    if (fileName.endsWith(`.${extension}`)) {
      return true;
    }
  }

  return false;
}

function isMigrationConnection(
  connection: RuleOptionConnection
): connection is RuleOptionConnection & z.infer<typeof connectByMigrationSchema> {
  return "migrationsDir" in connection;
}

export function isWatchMigrationsDirEnabled(
  connection: RuleOptionConnection
): connection is RuleOptionConnection &
  z.infer<typeof connectByMigrationSchema> & { watchMode: true } {
  return isMigrationConnection(connection) && (connection.watchMode ?? true) === true;
}

export function getMigrationDatabaseMetadata(params: {
  connectionUrl: string;
  databaseName: string;
}) {
  const connectionOptions = {
    ...parseConnection(params.connectionUrl),
    database: params.databaseName,
  };
  const databaseUrl = mapConnectionOptionsToString(connectionOptions);

  return { databaseUrl, connectionOptions };
}

type ConnectionStrategy =
  | {
      type: "databaseUrl";
      databaseUrl: string;
    }
  | {
      type: "migrations";
      migrationsDir: string;
      connectionUrl: string;
      databaseName: string;
      watchMode: boolean;
    };

export function getConnectionStartegyByRuleOptionConnection(params: {
  connection: RuleOptionConnection;
  projectDir: string;
}): ConnectionStrategy {
  const { connection, projectDir } = params;

  if ("databaseUrl" in connection) {
    return { type: "databaseUrl", ...connection };
  }

  if ("migrationsDir" in connection) {
    return {
      type: "migrations",
      connectionUrl: DEFAULT_CONNECTION_URL,
      databaseName: getDatabaseName({
        databaseName: connection.databaseName,
        migrationsDir: connection.migrationsDir,
        projectDir: projectDir,
      }),
      watchMode: isWatchMigrationsDirEnabled(connection),
      ...connection,
    };
  }

  return match(connection).exhaustive();
}

export interface ConnectionPayload {
  sql: Sql;
  databaseUrl: string;
  isFirst: boolean;
}

export function runMigrations(params: { migrationsPath: string; sql: Sql }) {
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

function runSingleMigrationFile(sql: Sql, filePath: string) {
  return pipe(
    TE.tryCatch(() => fs.promises.readFile(filePath).then((x) => x.toString()), E.toError),
    TE.chain((content) => TE.tryCatch(() => sql.unsafe(content), E.toError)),
    TE.mapLeft(InvalidMigrationError.fromErrorC(filePath))
  );
}
