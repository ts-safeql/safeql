import { ResolvedTarget } from "@ts-safeql/generate";
import {
  DuplicateColumnsError,
  InvalidConfigError,
  InvalidMigrationError,
  InvalidMigrationsPathError,
  PostgresError,
  QuerySourceMapEntry,
  fmap,
} from "@ts-safeql/shared";
import { InvalidQueryError } from "../errors";
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
  tag: TSESTree.Node;
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
  tag: TSESTree.Node;
  context: RuleContext;
  error: InvalidConfigError;
}) {
  const { tag, context, error } = params;

  return context.report({
    node: tag,
    messageId: "invalidQuery",
    loc: context.sourceCode.getLocFromIndex(getNodeStartOffset(tag)),
    data: {
      error: error.message,
    },
  });
}

export function reportDuplicateColumns(params: {
  tag: TSESTree.Node;
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
  tag: TSESTree.Node;
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
  tag: TSESTree.Node;
  baseNode: TSESTree.Node;
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

export function shouldLintFile(params: { filename: string }) {
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

/**
 * `json`/`jsonb` columns are generated as `any`, and `any` is a TypeScript
 * wildcard — assignable to and from every type — so any concrete annotation on
 * such a column is valid. A textual comparison would reject it, so we normalize
 * an `any` on either side to compatible before comparing.
 *
 * The expected and generated trees are the same shape but distinct types;
 * `ComparableTarget` is the common shape both widen into, keeping the
 * normalization a single cast-free recursion.
 */
type ComparableTarget =
  | { kind: "type"; value: string }
  | { kind: "literal"; value: string; base: ComparableTarget }
  | { kind: "union"; value: ComparableTarget[] }
  | { kind: "array"; value: ComparableTarget; syntax?: "array-type" | "type-reference" }
  | { kind: "object"; value: [string, ComparableTarget][] };

const ANY: ComparableTarget = { kind: "type", value: "any" };

const isAny = (target: ComparableTarget): boolean =>
  target.kind === "type" && target.value === "any";

/** In TypeScript `any | T` is just `any`, so collapse any union containing `any`. */
function collapseAny(target: ComparableTarget): ComparableTarget {
  switch (target.kind) {
    case "type":
      return target;
    case "literal":
      return { kind: "literal", value: target.value, base: collapseAny(target.base) };
    case "array":
      return { kind: "array", value: collapseAny(target.value), syntax: target.syntax };
    case "object":
      return {
        kind: "object",
        value: target.value.map(([key, v]): [string, ComparableTarget] => [key, collapseAny(v)]),
      };
    case "union": {
      const members = target.value.map(collapseAny);
      return members.some(isAny) ? ANY : { kind: "union", value: members };
    }
  }
}

/**
 * Where either side is `any`, set both positions to `any` so they serialize
 * identically. Mismatched shapes are returned as-is for the regular textual
 * comparison, so a genuine mismatch is never hidden.
 */
function alignAny(
  expected: ComparableTarget,
  generated: ComparableTarget,
): [ComparableTarget, ComparableTarget] {
  if (isAny(expected) || isAny(generated)) return [ANY, ANY];
  if (expected.kind !== generated.kind) return [expected, generated];

  if (expected.kind === "array" && generated.kind === "array") {
    const [e, g] = alignAny(expected.value, generated.value);
    return [
      { kind: "array", value: e, syntax: expected.syntax },
      { kind: "array", value: g, syntax: generated.syntax },
    ];
  }

  if (expected.kind === "object" && generated.kind === "object") {
    const generatedByKey = new Map(generated.value);
    const aligned = new Map(generated.value);

    const expectedEntries = expected.value.map(([key, value]): [string, ComparableTarget] => {
      const counterpart = generatedByKey.get(key);
      if (counterpart === undefined) return [key, value];

      const [e, g] = alignAny(value, counterpart);
      aligned.set(key, g);
      return [key, e];
    });

    return [
      { kind: "object", value: expectedEntries },
      { kind: "object", value: [...aligned] },
    ];
  }

  if (expected.kind === "union" && generated.kind === "union") {
    // Members have no inherent order, so pair each expected member with the first
    // unpaired generated member of the same kind. This reaches an `any` nested
    // inside a member (e.g. `{ data: any }[] | null`); unpaired members stay as-is
    // and the full union is still compared textually, so no real mismatch is masked.
    const generatedMembers = [...generated.value];
    const paired = new Set<number>();

    const expectedMembers = expected.value.map((member) => {
      const match = generatedMembers.findIndex((g, i) => !paired.has(i) && g.kind === member.kind);
      if (match === -1) return member;

      paired.add(match);
      const [e, g] = alignAny(member, generatedMembers[match]);
      generatedMembers[match] = g;
      return e;
    });

    return [
      { kind: "union", value: expectedMembers },
      { kind: "union", value: generatedMembers },
    ];
  }

  if (expected.kind === "literal" && generated.kind === "literal") {
    const [base, generatedBase] = alignAny(expected.base, generated.base);
    return [
      { kind: "literal", value: expected.value, base },
      { kind: "literal", value: generated.value, base: generatedBase },
    ];
  }

  return [expected, generated];
}

export function normalizeAnyForComparison(
  expected: ExpectedResolvedTarget,
  generated: ResolvedTarget,
): { expected: ComparableTarget; generated: ComparableTarget } {
  const [alignedExpected, alignedGenerated] = alignAny(
    collapseAny(expected),
    collapseAny(generated),
  );
  return { expected: alignedExpected, generated: alignedGenerated };
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

export function getResolvedTargetsEquality(params: {
  expected: ExpectedResolvedTarget | null;
  generated: ResolvedTarget | null;
  nullAsOptional: boolean;
  nullAsUndefined: boolean;
  inferLiterals: InferLiteralsOption;
  transform?: TypeTransformer;
}) {
  if (params.expected === null && params.generated === null) {
    return {
      isEqual: true,
      expected: params.expected,
      generated: params.generated,
    };
  }

  if (params.expected === null || params.generated === null) {
    return {
      isEqual: false,
      expected: params.expected,
      generated: params.generated,
    };
  }

  // Normalized only for the equality check; originals are returned for the error message.
  const normalized = normalizeAnyForComparison(params.expected, params.generated);

  let expectedString = getResolvedTargetComparableString({
    target: normalized.expected,
    nullAsOptional: false,
    nullAsUndefined: false,
    inferLiterals: params.inferLiterals,
  });

  let generatedString = getResolvedTargetComparableString({
    target: normalized.generated,
    nullAsOptional: params.nullAsOptional,
    nullAsUndefined: params.nullAsUndefined,
    inferLiterals: params.inferLiterals,
  });

  if (expectedString === null || generatedString === null) {
    return {
      isEqual: false,
      expected: params.expected,
      generated: params.generated,
    };
  }

  expectedString = expectedString.replace(/'/g, '"');
  generatedString = generatedString.replace(/'/g, '"');

  // The comparable form is already canonical, so no further reordering is needed.
  if (params.transform !== undefined) {
    generatedString = transformTypes(generatedString, params.transform);
  }

  return {
    isEqual: expectedString === generatedString,
    expected: params.expected,
    generated: params.generated,
  };
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
  tag: TSESTree.Node;
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

  const errorToken = extractErrorToken(error.message);

  if (errorToken !== undefined) {
    const templateText = sourceCode.text.slice(getNodeStartOffset(tag), tag.range[1]);

    const [fragmentStart, fragmentEnd] = matchingSourceMap
      ? [
          matchingSourceMap.original.start,
          matchingSourceMap.original.start + matchingSourceMap.original.text.length,
        ]
      : [0, templateText.length];

    const tokenIndex = findNearestMatchIndex(
      templateText.slice(fragmentStart, fragmentEnd),
      errorToken,
      sourceRange[0] - fragmentStart,
    );

    if (tokenIndex !== undefined) {
      const start = fragmentStart + tokenIndex;
      return {
        sourceLocation: getSourceLocation(tag, sourceCode, [start, start + errorToken.length]),
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

const ERROR_TOKEN_PATTERNS: RegExp[] = [
  /syntax error at or near "([^"]+)"/,
  /column "?([^\s"]+)"? of relation "[^"]+" does not exist/,
  /column "?([^\s"]+)"? does not exist/,
  /relation "([^"]+)" does not exist/,
  /type "([^"]+)" does not exist/,
  /missing FROM-clause entry for table "([^"]+)"/,
  /function ([\w.]+)\(/,
];

function extractErrorToken(message: string): string | undefined {
  for (const pattern of ERROR_TOKEN_PATTERNS) {
    const token = message.match(pattern)?.[1];
    if (token !== undefined) {
      return token;
    }
  }

  return undefined;
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
  tag: TSESTree.Node,
  sourceCode: Readonly<SourceCode>,
  range: [number, number],
  extendToWord = false,
): TSESTree.SourceLocation {
  const tagStart = getNodeStartOffset(tag);
  const start = sourceCode.getLocFromIndex(tagStart + range[0]);
  const end = sourceCode.getLocFromIndex(tagStart + range[1]);

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

function getNodeStartOffset(node: TSESTree.Node) {
  return "quasi" in node ? node.quasi.range[0] : node.range[0];
}
