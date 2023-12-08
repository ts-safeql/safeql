import { ResolvedTarget } from "@ts-safeql/generate";
import {
  DuplicateColumnsError,
  InvalidMigrationError,
  InvalidMigrationsPathError,
  InvalidQueryError,
  PostgresError,
  fmap,
} from "@ts-safeql/shared";
import { TSESTree } from "@typescript-eslint/utils";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Sql } from "postgres";
import { match } from "ts-pattern";
import { z } from "zod";
import { ESTreeUtils } from "../utils";
import { E, TE, pipe } from "../utils/fp-ts";
import { mapConnectionOptionsToString, parseConnection } from "../utils/pg.utils";
import { RuleContext, RuleOptionConnection, zConnectionMigration } from "./check-sql.rule";
import { WorkerError } from "./check-sql.worker";

type TypeReplacerString = string;
type TypeReplacerFromTo = [string, string];
export type TypeTransformer = TypeReplacerString | (TypeReplacerString | TypeReplacerFromTo)[];

export const DEFAULT_CONNECTION_URL = "postgres://postgres:postgres@localhost:5432/postgres";

function isReplacerFromTo(replacer: TypeTransformer[number]): replacer is TypeReplacerFromTo {
  return Array.isArray(replacer) && replacer.length === 2;
}

function transformType(typeString: string, typeReplacer: TypeTransformer[number]): string {
  return isReplacerFromTo(typeReplacer)
    ? typeString.replace(new RegExp(typeReplacer[0], "g"), typeReplacer[1])
    : typeReplacer.replace("{type}", typeString);
}

export function transformTypes(typeString: string, transform: TypeTransformer): string {
  if (transform === undefined || typeString === null) {
    return typeString;
  }

  if (typeof transform === "string") {
    return transformType(typeString, transform);
  }

  let transformed = typeString;

  for (const replacer of transform) {
    transformed = transformType(transformed, replacer);
  }

  return transformed;
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
export function getFinalResolvedTargetString(params: {
  target: ResolvedTarget;
  transform?: TypeTransformer;
  nullAsUndefined: boolean;
  nullAsOptional: boolean;
}) {
  const asString = getResolvedTargetString({
    target: params.target,
    nullAsOptional: params.nullAsOptional,
    nullAsUndefined: params.nullAsUndefined,
  });

  return fmap(params.transform, (transform) => transformTypes(asString, transform)) ?? asString;
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
  actual: string;
}) {
  const { context, tag, baseNode, actual } = params;

  return context.report({
    node: tag,
    messageId: "missingTypeAnnotations",
    loc: baseNode.loc,
    fix: (fixer) => fixer.insertTextAfterRange(baseNode.range, `<${actual}>`),
    data: {
      fix: actual,
    },
  });
}

export function reportIncorrectTypeAnnotations(params: {
  context: RuleContext;
  typeParameter: TSESTree.TSTypeParameterInstantiation;
  expected: string | null;
  actual: string | null;
}) {
  const { context, typeParameter } = params;
  const newValue = params.actual === null ? "" : `<${params.actual}>`;

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
): connection is RuleOptionConnection & z.infer<typeof zConnectionMigration> {
  return "migrationsDir" in connection;
}

export function isWatchMigrationsDirEnabled(
  connection: RuleOptionConnection
): connection is RuleOptionConnection & z.infer<typeof zConnectionMigration> & { watchMode: true } {
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

export function getResolvedTargetComparableString(params: {
  target: ResolvedTarget;
  nullAsOptional: boolean;
  nullAsUndefined: boolean;
}): string {
  const { target, nullAsUndefined, nullAsOptional } = params;
  const nullType = nullAsUndefined ? "undefined" : "null";

  switch (target.kind) {
    case "type":
      return (target.value === "null" ? nullType : target.value).replace(/"/g, "'");

    case "union":
      return target.value
        .map((target) => getResolvedTargetComparableString({ ...params, target }))
        .sort()
        .join("|");
    case "array":
      return `${getResolvedTargetComparableString({ ...params, target: target.value })}[]`;
    case "object": {
      if (target.value.length === 0) {
        return `{ }`;
      }

      const entriesString = target.value
        .map(([key, target]) => {
          const isNullable = isNullableResolvedTarget(target);
          const keyString = isNullable && nullAsOptional ? `${key}?` : key;
          const valueString = getResolvedTargetComparableString({ ...params, target });

          return `${keyString}:${valueString}`;
        })
        .sort()
        .join(";");

      return `{${entriesString}}`;
    }
  }
}

export function getResolvedTargetString(params: {
  target: ResolvedTarget;
  nullAsUndefined: boolean;
  nullAsOptional: boolean;
}): string {
  const { target, nullAsUndefined, nullAsOptional } = params;
  const nullType = nullAsUndefined ? "undefined" : "null";

  switch (target.kind) {
    case "type":
      return target.value === "null" ? nullType : target.value;

    case "union":
      return target.value
        .map((target) => getResolvedTargetString({ ...params, target }))
        .join(" | ");

    case "array":
      return `${getResolvedTargetString({ ...params, target: target.value })}[]`;

    case "object": {
      if (target.value.length === 0) {
        return `{ }`;
      }

      const entriesString = target.value
        .map(([key, target]) => {
          const isNullable = isNullableResolvedTarget(target);
          const keyString = isNullable && nullAsOptional ? `${key}?` : key;
          const valueString = getResolvedTargetString({ ...params, target });

          return `${keyString}: ${valueString}`;
        })
        .join("; ");

      return `{ ${entriesString} }`;
    }
  }
}

function isNullableResolvedTarget(target: ResolvedTarget): boolean {
  switch (target.kind) {
    case "type":
      return ["any", "null"].includes(target.value) === false;

    case "union":
      return target.value.some((x) => x.kind === "type" && x.value === "null");

    case "array":
    case "object":
      return false;
  }
}
