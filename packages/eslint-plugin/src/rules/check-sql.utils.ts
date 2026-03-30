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
import { RuleFixer, SourceCode } from "@typescript-eslint/utils/ts-eslint";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Sql } from "postgres";
import { z } from "zod";
import { isOneOf } from "../utils/estree.utils";
import { E, TE, pipe } from "../utils/fp-ts";
import { ExpectedResolvedTarget } from "../utils/get-resolved-target-by-type-node";
import { mapConnectionOptionsToString, parseConnection } from "../utils/pg.utils";
import { WorkerError } from "../workers/check-sql.worker";
import { RuleContext } from "./check-sql.rule";
import {
  EnforceTypeOption,
  InferLiteralsOption,
  RuleOptionConnection,
  zConnectionMigration,
} from "./RuleOptions";
import { ConnectionStrategy } from "@ts-safeql/connection-manager";

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
  enforceType?: EnforceTypeOption;
}) {
  const { context, tag, baseNode, actual, enforceType = "fix" } = params;

  const fixFn = (fixer: RuleFixer) => fixer.insertTextAfterRange(baseNode.range, `<${actual}>`);
  const data = { fix: actual };

  return context.report({
    node: tag,
    messageId: "missingTypeAnnotations",
    loc: baseNode.loc,
    data,
    ...(enforceType === "suggest"
      ? { suggest: [{ messageId: "missingTypeAnnotations" as const, fix: fixFn, data }] }
      : { fix: fixFn }),
  });
}

export function reportIncorrectTypeAnnotations(params: {
  context: RuleContext;
  typeParameter: TSESTree.TSTypeParameterInstantiation;
  expected: string | null;
  actual: string | null;
  enforceType?: EnforceTypeOption;
}) {
  const { context, typeParameter, enforceType = "fix" } = params;
  const newValue = params.actual === null ? "" : `<${params.actual}>`;

  const fixFn = (fixer: RuleFixer) => fixer.replaceText(typeParameter, newValue);
  const data = { expected: params.expected, actual: params.actual ?? "No type annotation" };

  return context.report({
    node: typeParameter.params[0],
    messageId: "incorrectTypeAnnotations",
    data,
    ...(enforceType === "suggest"
      ? { suggest: [{ messageId: "incorrectTypeAnnotations" as const, fix: fixFn, data }] }
      : { fix: fixFn }),
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
  const fileName = params.filename;

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

  if (connection.plugins && connection.plugins.length > 0) {
    return { type: "pluginsOnly", plugins: connection.plugins, projectDir };
  }

  throw new Error(
    "Invalid connection configuration: must specify databaseUrl, migrationsDir, or plugins",
  );
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

function shouldInferLiteral(
  base: ExpectedResolvedTarget | ResolvedTarget,
  inferLiterals: InferLiteralsOption,
) {
  if (base.kind !== "type") return true;
  if (inferLiterals === true) return true;
  if (Array.isArray(inferLiterals) && isOneOf(base.value, inferLiterals)) return true;

  return false;
}

function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

export function getResolvedTargetComparableString(params: {
  target: ExpectedResolvedTarget | ResolvedTarget;
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
  target: ExpectedResolvedTarget | ResolvedTarget;
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

function isNullableResolvedTarget(target: ExpectedResolvedTarget | ResolvedTarget): boolean {
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
    message: string;
    position: number;
    sourcemaps: QuerySourceMapEntry[];
  };
  tag: TSESTree.TaggedTemplateExpression;
  sourceCode: Readonly<SourceCode>;
}

function getQueryErrorPosition({ error, tag, sourceCode }: GetWordRangeInPositionParams) {
  const sourceMaps = error.sourcemaps;
  const position = error.position;

  const matchingSourceMap = sourceMaps.find(
    (sourceMap) => position >= sourceMap.generated.start && position < sourceMap.generated.end,
  );

  const sourceRange: [number, number] = matchingSourceMap
    ? [
        matchingSourceMap.original.start + matchingSourceMap.offset,
        matchingSourceMap.original.start + matchingSourceMap.original.text.length,
      ]
    : getSourceRange(position, sourceMaps);

  const syntaxErrorToken = error.message.match(/syntax error at or near "([^"]+)"/)?.[1];

  if (syntaxErrorToken) {
    const templateText = sourceCode.text.slice(tag.quasi.range[0], tag.quasi.range[1]);
    const tokenIndex = findNearestMatchIndex(templateText, syntaxErrorToken, sourceRange[0]);

    if (tokenIndex !== undefined) {
      return {
        sourceLocation: getSourceLocation(tag, sourceCode, [
          tokenIndex,
          tokenIndex + syntaxErrorToken.length,
        ]),
      };
    }
  }

  return {
    sourceLocation: getSourceLocation(
      tag,
      sourceCode,
      sourceRange,
      matchingSourceMap === undefined,
    ),
  };
}

function getSourceRange(position: number, sourceMaps: QuerySourceMapEntry[]): [number, number] {
  let positionOffset = 0;

  for (const sourceMap of sourceMaps) {
    if (position < sourceMap.generated.end) {
      continue;
    }

    positionOffset += sourceMap.original.text.length - sourceMap.generated.text.length;
  }

  return [position + positionOffset, position + positionOffset + 1];
}

function findNearestMatchIndex(text: string, searchText: string, position: number) {
  let closestIndex: number | undefined;

  for (
    let currentIndex = text.indexOf(searchText);
    currentIndex !== -1;
    currentIndex = text.indexOf(searchText, currentIndex + 1)
  ) {
    if (
      closestIndex === undefined ||
      Math.abs(currentIndex - position) < Math.abs(closestIndex - position)
    ) {
      closestIndex = currentIndex;
    }
  }

  return closestIndex;
}

function getSourceLocation(
  tag: TSESTree.TaggedTemplateExpression,
  sourceCode: Readonly<SourceCode>,
  range: [number, number],
  extendToWord = false,
): TSESTree.SourceLocation {
  const start = sourceCode.getLocFromIndex(tag.quasi.range[0] + range[0]);
  const end = sourceCode.getLocFromIndex(tag.quasi.range[0] + range[1]);

  if (!extendToWord) {
    return { start, end };
  }

  const lineTail = sourceCode.getLines()[start.line - 1].substring(start.column);
  const wordLength = (lineTail.match(/^[\w.{}'$"]+/)?.at(0)?.length ?? 1) - 1;

  return {
    start,
    end: {
      line: end.line,
      column: end.column + wordLength,
    },
  };
}

