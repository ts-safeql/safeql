import { ResolvedTarget } from "@ts-safeql/generate";
import {
  DuplicateColumnsError,
  InvalidConfigError,
  InvalidMigrationError,
  InvalidMigrationsPathError,
  InvalidQueryError,
  PostgresError,
  QuerySourceMapEntry,
  fmap,
} from "@ts-safeql/shared";
import { TSESTree } from "@typescript-eslint/utils";
import { SourceCode } from "@typescript-eslint/utils/ts-eslint";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Sql } from "postgres";
import { match } from "ts-pattern";
import { z } from "zod";
import { E, TE, pipe } from "../utils/fp-ts";
import { mapConnectionOptionsToString, parseConnection } from "../utils/pg.utils";
import { WorkerError } from "../workers/check-sql.worker";
import { RuleContext } from "./check-sql.rule";
import { InferLiteralsOption, RuleOptionConnection, zConnectionMigration } from "./RuleOptions";
import { isOneOf } from "../utils/estree.utils";

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
  inferLiterals: InferLiteralsOption;
}) {
  const asString = getResolvedTargetString({
    target: params.target,
    nullAsOptional: params.nullAsOptional,
    nullAsUndefined: params.nullAsUndefined,
    inferLiterals: params.inferLiterals,
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
  hint?: string;
}) {
  const { context, tag, error } = params;

  return context.report({
    node: tag,
    messageId: "error",
    data: {
      error: [error.message, fmap(params.hint, (hint) => `Hint: ${hint}`)]
        .filter(Boolean)
        .join("\n"),
    },
  });
}

export function reportInvalidConfig(params: {
  tag: TSESTree.TaggedTemplateExpression;
  context: RuleContext;
  error: InvalidConfigError;
}) {
  const { tag, context, error } = params;

  return context.report({
    node: tag,
    messageId: "invalidQuery",
    loc: context.sourceCode.getLocFromIndex(tag.quasi.range[0]),
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

  const location = getQueryErrorPosition({
    tag: tag,
    error: error,
    sourceCode: context.sourceCode,
  });

  return context.report({
    node: tag,
    messageId: "invalidQuery",
    loc: location.sourceLocation,
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

  const location = getQueryErrorPosition({
    tag: tag,
    error: error,
    sourceCode: context.sourceCode,
  });

  return context.report({
    node: tag,
    messageId: "invalidQuery",
    loc: location.sourceLocation,
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
  connection: RuleOptionConnection,
): connection is RuleOptionConnection & z.infer<typeof zConnectionMigration> {
  return "migrationsDir" in connection;
}

export function isWatchMigrationsDirEnabled(
  connection: RuleOptionConnection,
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
    TE.chainW((files) => TE.sequenceSeqArray(files.map(runSingleMigrationFileWithSql))),
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
    TE.mapLeft(InvalidMigrationsPathError.fromErrorC(migrationsPath)),
  );
}

function runSingleMigrationFile(sql: Sql, filePath: string) {
  return pipe(
    TE.tryCatch(() => fs.promises.readFile(filePath).then((x) => x.toString()), E.toError),
    TE.chain((content) => TE.tryCatch(() => sql.unsafe(content), E.toError)),
    TE.mapLeft(InvalidMigrationError.fromErrorC(filePath)),
  );
}

function shouldInferLiteral(base: ResolvedTarget, inferLiterals: InferLiteralsOption) {
  if (base.kind !== "type") return true;
  if (inferLiterals === true) return true;
  if (Array.isArray(inferLiterals) && isOneOf(base.value, inferLiterals)) return true;

  return false;
}

function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

export function getResolvedTargetComparableString(params: {
  target: ResolvedTarget;
  nullAsOptional: boolean;
  nullAsUndefined: boolean;
  inferLiterals: InferLiteralsOption;
}): string {
  const { target, nullAsUndefined, nullAsOptional } = params;
  const nullType = nullAsUndefined ? "undefined" : "null";

  switch (target.kind) {
    case "literal": {
      const value = shouldInferLiteral(target.base, params.inferLiterals)
        ? target.value
        : getResolvedTargetComparableString({
            target: target.base,
            nullAsOptional: params.nullAsOptional,
            nullAsUndefined: params.nullAsUndefined,
            inferLiterals: params.inferLiterals,
          });

      return value === "null" ? nullType : value;
    }
    case "type":
      return target.value === "null" ? nullType : target.value.replace(/"/g, "'");

    case "union":
      return unique(
        target.value
          .map((target) => getResolvedTargetComparableString({ ...params, target }))
          .sort(),
      ).join(" | ");

    case "array": {
      let arrayString = getResolvedTargetComparableString({ ...params, target: target.value });

      if (target.value.kind === "union" && arrayString.includes("|")) {
        arrayString = `(${arrayString})`;
      }

      return target.syntax === "type-reference" ? `Array<${arrayString}>` : `${arrayString}[]`;
    }

    case "object": {
      if (target.value.length === 0) {
        return `{ }`;
      }

      const entriesString = target.value
        .map(([key, target]) => {
          const isNullable = isNullableResolvedTarget(target);
          const keyString = isNullable && nullAsOptional ? `${key}?` : key;
          const valueString = getResolvedTargetComparableString({ ...params, target });

          return `${keyString}: ${valueString}`;
        })
        .sort()
        .join(";");

      return `{ ${entriesString} }`;
    }
  }
}

export function getResolvedTargetString(params: {
  target: ResolvedTarget;
  nullAsUndefined: boolean;
  nullAsOptional: boolean;
  inferLiterals: InferLiteralsOption;
}): string {
  const { target, nullAsUndefined, nullAsOptional } = params;
  const nullType = nullAsUndefined ? "undefined" : "null";

  switch (target.kind) {
    case "literal": {
      const value = shouldInferLiteral(target.base, params.inferLiterals)
        ? target.value
        : getResolvedTargetString({
            target: target.base,
            nullAsOptional: params.nullAsOptional,
            nullAsUndefined: params.nullAsUndefined,
            inferLiterals: params.inferLiterals,
          });

      return value === "null" ? nullType : value;
    }

    case "type":
      return target.value === "null" ? nullType : target.value;

    case "union":
      return unique(
        target.value.map((target) => getResolvedTargetString({ ...params, target })),
      ).join(" | ");

    case "array": {
      const arrayString = getResolvedTargetString({ ...params, target: target.value });
      return target.value.kind === "union" && arrayString.includes("|")
        ? `(${arrayString})[]`
        : `${arrayString}[]`;
    }

    case "object": {
      if (target.value.length === 0) {
        return `{ }`;
      }

      const entriesString = target.value
        .map(([key, target]) => {
          const isNullable = isNullableResolvedTarget(target);
          const valueString = getResolvedTargetString({ ...params, target });
          let keyString = key;

          if (/[^A-z_]/.test(keyString)) {
            keyString = `'${keyString}'`;
          }

          keyString = isNullable && nullAsOptional ? `${keyString}?` : keyString;

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
    case "literal":
      return ["any", "null"].includes(target.value) === false;

    case "union":
      return target.value.some((x) => x.kind === "type" && x.value === "null");

    case "array":
    case "object":
      return false;
  }
}

interface GetWordRangeInPositionParams {
  error: {
    position: number;
    sourcemaps: QuerySourceMapEntry[];
  };
  tag: TSESTree.TaggedTemplateExpression;
  sourceCode: Readonly<SourceCode>;
}

function getQueryErrorPosition(params: GetWordRangeInPositionParams) {
  const range: [number, number] = [params.error.position, params.error.position + 1];

  for (const entry of params.error.sourcemaps) {
    const generatedLength = Math.max(0, entry.generated.end - entry.generated.start);
    const originalLength = Math.max(0, entry.original.end - entry.original.start);
    const adjustment = originalLength - generatedLength;

    if (range[0] >= entry.generated.start && range[1] <= entry.generated.end) {
      range[0] = entry.original.start + entry.offset;
      range[1] = entry.original.start + entry.offset + 1;
      continue;
    }

    if (params.error.position >= entry.generated.start) {
      range[0] += adjustment;
    }

    if (params.error.position >= entry.generated.end) {
      range[1] += adjustment;
    }
  }

  const start = params.sourceCode.getLocFromIndex(params.tag.quasi.range[0] + range[0]);
  const startLineText = params.sourceCode.getLines()[start.line - 1];
  const remainingLineText = startLineText.substring(start.column);
  const remainingWordLength = (remainingLineText.match(/^[\w.{}'$"]+/)?.at(0)?.length ?? 1) - 1;

  const end = params.sourceCode.getLocFromIndex(params.tag.quasi.range[0] + range[1]);

  const sourceLocation: TSESTree.SourceLocation = {
    start: start,
    end: {
      line: end.line,
      column: end.column + remainingWordLength,
    },
  };

  return {
    range,
    sourceLocation: sourceLocation,
    remainingLineText: remainingLineText,
    remainingWordLength: remainingWordLength,
  };
}
