import { GenerateResult } from "@ts-safeql/generate";
import {
  defaultTypeMapping,
  doesMatchPattern,
  objectKeysNonEmpty,
  PostgresError,
} from "@ts-safeql/shared";
import { ESLintUtils, ParserServices, TSESLint, TSESTree } from "@typescript-eslint/utils";
import pgParser from "libpg-query";
import { createSyncFn } from "synckit";
import { match } from "ts-pattern";
import ts from "typescript";
import z from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { ESTreeUtils } from "../utils";
import { E, flow, J, pipe } from "../utils/fp-ts";
import { getTypeProperties } from "../utils/get-type-properties";
import { memoize } from "../utils/memoize";
import { locateNearestPackageJsonDir } from "../utils/node.utils";
import { mapTemplateLiteralToQueryText } from "../utils/ts-pg.utils";
import { getConfigFromFileWithContext } from "./check-sql.config";
import {
  arrayEntriesToTsTypeString,
  reportBaseError,
  reportDuplicateColumns,
  reportIncorrectTypeAnnotations,
  reportInvalidQueryError,
  reportInvalidTypeAnnotations,
  reportMissingTypeAnnotations,
  reportPostgresError,
  shouldLintFile,
  transformTypes,
  TypeTransformer,
  withTransformType,
} from "./check-sql.utils";
import { WorkerError, WorkerParams, WorkerResult } from "./check-sql.worker";

const messages = {
  typeInferenceFailed: "Type inference failed {{error}}",
  error: "{{error}}",
  invalidQuery: "Invalid Query: {{error}}",
  missingTypeAnnotations: "Query is missing type annotation\n\tFix with: {{fix}}",
  incorrectTypeAnnotations: `Query has incorrect type annotation.\n\tExpected: {{expected}}\n\tActual: {{actual}}`,
  invalidTypeAnnotations: `Query has invalid type annotation (SafeQL does not support it. If you think it should, please open an issue)`,
};
export type RuleMessage = keyof typeof messages;

const zStringOrRegex = z.union([z.string(), z.object({ regex: z.string() })]);

const zBaseTarget = z.object({
  /**
   * Transform the end result of the type.
   *
   * For example:
   *  - `"{type}[]"` will transform the type to an array
   *  - `["colname", "x_colname"]` will replace `colname` with `x_colname` in the type.
   *  - `["{type}[]", ["colname", x_colname"]]` will do both
   */
  transform: z
    .union([z.string(), z.array(z.union([z.string(), z.tuple([z.string(), z.string()])]))])
    .optional(),

  /**
   * Transform the (column) field key. Can be one of the following:
   * - `"snake"` - `userId` → `user_id`
   * - `"camel"` - `user_id` → `userId`
   * - `"pascal"` - `user_id` → `UserId`
   * - `"screaming snake"` - `user_id` → `USER_ID`
   */
  fieldTransform: z.enum(["snake", "pascal", "camel", "screaming snake"]).optional(),

  /**
   * Whether or not to skip type annotation.
   */
  skipTypeAnnotations: z.boolean().optional(),
});

/**
 * A target that acts as a wrapper for the query. For example:
 *
 * ```ts
 * const query = conn.query(sql`SELECT * FROM users`);
 *               ^^^^^^^^^^ wrapper
 * ```
 */
const zWrapperTarget = z.object({ wrapper: zStringOrRegex }).merge(zBaseTarget);
type WrapperTarget = z.infer<typeof zWrapperTarget>;

/**
 * A target that is a tag expression. For example:
 *
 * ```ts
 * const query = sql`SELECT * FROM users`;
 *               ^^^ tag
 * ```
 */
const zTagTarget = z.object({ tag: zStringOrRegex }).merge(zBaseTarget);
type TagTarget = z.infer<typeof zTagTarget>;

export type ConnectionTarget = WrapperTarget | TagTarget;

const zOverrideTypeResolver = z.union([
  z.string(),
  z.object({ parameter: zStringOrRegex, return: z.string() }),
]);

const zBaseSchema = z.object({
  targets: z.union([zWrapperTarget, zTagTarget]).array(),

  /**
   * Whether or not keep the connection alive. Change it only if you know what you're doing.
   */
  keepAlive: z.boolean().optional(),

  /**
   * Override defaults
   */
  overrides: z
    .object({
      types: z.union([
        z.record(z.enum(objectKeysNonEmpty(defaultTypeMapping)), zOverrideTypeResolver),
        z.record(z.string(), zOverrideTypeResolver),
      ]),
    })
    .partial()
    .optional(),

  /**
   * Use `undefined` instead of `null` when the value is nullable.
   */
  nullAsUndefined: z.boolean().optional(),

  /**
   * Mark the property as optional when the value is nullable.
   */
  nullAsOptional: z.boolean().optional(),
});

export const zConnectionMigration = z.object({
  /**
   * The path where the migration files are located.
   */
  migrationsDir: z.string(),

  /**
   * THIS IS NOT THE PRODUCTION DATABASE.
   *
   * A connection url to the database.
   * This is required since in order to run the migrations, a connection to postgres is required.
   * Will be used only to create and drop the shadow database (see `databaseName`).
   */
  connectionUrl: z.string().optional(),

  /**
   * The name of the shadow database that will be created from the migration files.
   */
  databaseName: z.string().optional(),

  /**
   * Whether or not should refresh the shadow database when the migration files change.
   */
  watchMode: z.boolean().optional(),
});

const zConnectionUrl = z.object({
  /**
   * The connection url to the database
   */
  databaseUrl: z.string(),
});

const zRuleOptionConnection = z.union([
  zBaseSchema.merge(zConnectionMigration),
  zBaseSchema.merge(zConnectionUrl),
]);
export type RuleOptionConnection = z.infer<typeof zRuleOptionConnection>;

export const zConfig = z.object({
  connections: z.union([z.array(zRuleOptionConnection), zRuleOptionConnection]),
});
export type Config = z.infer<typeof zConfig>;

export const UserConfigFile = z.object({ useConfigFile: z.boolean() });
export type UserConfigFile = z.infer<typeof UserConfigFile>;

export const Options = z.union([zConfig, UserConfigFile]);
export type Options = z.infer<typeof Options>;

export const RuleOptions = z.array(Options).min(1).max(1);
export type RuleOptions = z.infer<typeof RuleOptions>;

export type RuleContext = Readonly<TSESLint.RuleContext<RuleMessage, RuleOptions>>;

const workerPath = require.resolve("./check-sql.worker");

const generateSync = createSyncFn<(params: WorkerParams) => Promise<E.Either<unknown, string>>>(
  workerPath,
  {
    tsRunner: "esbuild-register",
    timeout: 1000 * 60 * 5,
  },
);

function check(params: {
  context: RuleContext;
  config: Config;
  tag: TSESTree.TaggedTemplateExpression;
  projectDir: string;
}) {
  const connections = Array.isArray(params.config.connections)
    ? params.config.connections
    : [params.config.connections];

  for (const connection of connections) {
    for (const target of connection.targets) {
      checkConnection({ ...params, connection, target });
    }
  }
}

function isTagMemberValid(
  expr: TSESTree.TaggedTemplateExpression,
): expr is TSESTree.TaggedTemplateExpression &
  (
    | {
        tag: TSESTree.Identifier;
      }
    | {
        tag: TSESTree.MemberExpression & {
          property: TSESTree.Identifier;
        };
      }
  ) {
  // For example sql``
  if (ESTreeUtils.isIdentifier(expr.tag)) {
    return true;
  }

  // For example Provider.sql``
  if (ESTreeUtils.isMemberExpression(expr.tag) && ESTreeUtils.isIdentifier(expr.tag.property)) {
    return true;
  }

  return false;
}

function checkConnection(params: {
  context: RuleContext;
  connection: RuleOptionConnection;
  target: ConnectionTarget;
  tag: TSESTree.TaggedTemplateExpression;
  projectDir: string;
}) {
  if ("tag" in params.target) {
    return checkConnectionByTagExpression({ ...params, target: params.target });
  }

  if ("wrapper" in params.target) {
    return checkConnectionByWrapperExpression({ ...params, target: params.target });
  }

  return match(params.target).exhaustive();
}

const pgParseQueryE = (query: string) => {
  return pipe(
    E.tryCatch(
      () => pgParser.parseQuerySync(query),
      (error) => PostgresError.to(query, error),
    ),
  );
};

const generateSyncE = flow(
  generateSync,
  E.chain(J.parse),
  E.chainW((parsed) => parsed as unknown as E.Either<WorkerError, WorkerResult>),
  E.mapLeft((error) => error as unknown as WorkerError),
);

function reportCheck(params: {
  context: RuleContext;
  tag: TSESTree.TaggedTemplateExpression;
  connection: RuleOptionConnection;
  target: ConnectionTarget;
  projectDir: string;
  typeParameter: TSESTree.TSTypeParameterInstantiation | undefined;
  baseNode: TSESTree.BaseNode;
}) {
  const { context, tag, connection, target, projectDir, typeParameter, baseNode } = params;

  return pipe(
    E.Do,
    E.bind("parser", () => E.of(ESLintUtils.getParserServices(context))),
    E.bind("checker", ({ parser }) => E.of(parser.program.getTypeChecker())),
    E.bind("query", ({ parser, checker }) =>
      mapTemplateLiteralToQueryText(tag.quasi, parser, checker, params.connection),
    ),
    E.bindW("pgParsed", ({ query }) => pgParseQueryE(query)),
    E.bindW("result", ({ query, pgParsed }) =>
      generateSyncE({ query, pgParsed, connection, target, projectDir }),
    ),
    E.fold(
      (error) => {
        return match(error)
          .with({ _tag: "DuplicateColumnsError" }, (error) => {
            return reportDuplicateColumns({ context, error, tag });
          })
          .with({ _tag: "PostgresError" }, (error) => {
            return reportPostgresError({ context, error, tag });
          })
          .with({ _tag: "InvalidQueryError" }, (error) => {
            return reportInvalidQueryError({ context, error });
          })
          .with(
            { _tag: "InvalidMigrationError" },
            { _tag: "InvalidMigrationsPathError" },
            { _tag: "DatabaseInitializationError" },
            { _tag: "InternalError" },
            (error) => {
              return reportBaseError({ context, error, tag });
            },
          )
          .exhaustive();
      },
      ({ result, checker, parser }) => {
        const shouldSkipTypeAnnotations = target.skipTypeAnnotations === true;

        if (shouldSkipTypeAnnotations) {
          return;
        }

        const isMissingTypeAnnotations = typeParameter === undefined;
        const resultWithTransformed = withTransformType(result, target.transform);

        if (isMissingTypeAnnotations) {
          if (resultWithTransformed.resultAsString === null) {
            return;
          }

          return reportMissingTypeAnnotations({
            tag: tag,
            context: context,
            baseNode: baseNode,
            actual: resultWithTransformed.resultAsString,
          });
        }

        const reservedTypes = memoize({
          key: `reserved-types:${JSON.stringify(connection.overrides?.types)}`,
          value: () => {
            const types = new Set<string>();

            for (const value of Object.values(connection.overrides?.types ?? {})) {
              types.add(typeof value === "string" ? value : value.return);
            }

            return types;
          },
        });

        const typeAnnotationState = getTypeAnnotationState({
          result: resultWithTransformed,
          typeParameter: typeParameter,
          transform: target.transform,
          checker: checker,
          parser: parser,
          reservedTypes: reservedTypes,
        });

        if (typeAnnotationState === "INVALID") {
          return reportInvalidTypeAnnotations({
            context: context,
            typeParameter: typeParameter,
          });
        }

        if (!typeAnnotationState.isEqual) {
          return reportIncorrectTypeAnnotations({
            context,
            typeParameter: typeParameter,
            expected: arrayEntriesToTsTypeString(typeAnnotationState.expected),
            actual: resultWithTransformed.resultAsString,
          });
        }
      },
    ),
  );
}

function checkConnectionByTagExpression(params: {
  context: RuleContext;
  connection: RuleOptionConnection;
  target: TagTarget;
  tag: TSESTree.TaggedTemplateExpression;
  projectDir: string;
}) {
  const { context, tag, projectDir, connection, target } = params;

  const tagAsText = context
    .getSourceCode()
    .getText(tag.tag)
    .replace(/^this\./, "");

  if (doesMatchPattern({ pattern: target.tag, text: tagAsText })) {
    return reportCheck({
      context,
      tag,
      connection,
      target,
      projectDir,
      baseNode: tag.tag,
      typeParameter: tag.typeParameters,
    });
  }
}

function checkConnectionByWrapperExpression(params: {
  context: RuleContext;
  connection: RuleOptionConnection;
  target: WrapperTarget;
  tag: TSESTree.TaggedTemplateExpression;
  projectDir: string;
}) {
  const { context, tag, projectDir, connection, target } = params;

  if (
    !isTagMemberValid(tag) ||
    !ESTreeUtils.isCallExpression(tag.parent) ||
    !ESTreeUtils.isMemberExpression(tag.parent.callee)
  ) {
    return;
  }

  const calleeAsText = context
    .getSourceCode()
    .getText(tag.parent.callee)
    .replace(/^this\./, "");

  if (doesMatchPattern({ pattern: target.wrapper, text: calleeAsText })) {
    return reportCheck({
      context,
      tag,
      connection,
      target,
      projectDir,
      baseNode: tag.parent.callee,
      typeParameter: tag.parent.typeParameters,
    });
  }
}

function getTypeAnnotationState(params: {
  result: GenerateResult;
  typeParameter: TSESTree.TSTypeParameterInstantiation;
  transform?: TypeTransformer;
  parser: ParserServices;
  checker: ts.TypeChecker;
  reservedTypes: Set<string>;
}) {
  const {
    result: { result: generated },
    typeParameter,
    transform,
    parser,
    checker,
    reservedTypes,
  } = params;

  if (typeParameter.params.length !== 1) {
    return "INVALID" as const;
  }

  const typeNode = typeParameter.params[0];

  const { properties, isArray } = getTypeProperties({
    checker,
    parser,
    typeNode,
    reservedTypes,
  });

  const expected = [...new Map(properties).entries()];

  return getTypesEquality({ expected, generated, transform, isArray });
}

function getTypesEquality(params: {
  expected: [string, string][] | null;
  generated: [string, string][] | null;
  isArray: boolean;
  transform?: TypeTransformer;
}) {
  const { expected, generated, isArray, transform } = params;

  if (expected === null && generated === null) {
    return { isEqual: true, expected, generated };
  }

  if (expected === null || generated === null) {
    return { isEqual: false, expected, generated };
  }

  const omitRegex = /[\n ;'"]/g;
  const expectedSorted = [...expected].sort(([a], [b]) => a.localeCompare(b));
  const generatedSorted = [...generated].sort(([a], [b]) => a.localeCompare(b));
  const $toString = (x: [string, string][]): string => {
    return x.map(([key, value]) => [key, value.replace(omitRegex, "")]).join("");
  };

  const expectedString = $toString(expectedSorted) + (isArray ? "[]" : "");
  const generatedString = transform
    ? transformTypes($toString(generatedSorted), transform)
    : $toString(generatedSorted);

  return {
    isEqual: expectedString === generatedString,
    expected,
    generated,
  };
}

const createRule = ESLintUtils.RuleCreator(() => `https://github.com/ts-safeql/safeql`)<
  RuleOptions,
  RuleMessage
>;

export default createRule({
  name: "check-sql",
  meta: {
    fixable: "code",
    docs: {
      description: "Ensure that sql queries have type annotations",
      recommended: "error",
      suggestion: true,
      requiresTypeChecking: false,
    },
    messages: messages,
    type: "problem",
    schema: zodToJsonSchema(RuleOptions, { target: "openApi3" }) as object,
  },
  defaultOptions: [],
  create(context) {
    if (!shouldLintFile(context)) {
      return {};
    }

    const projectDir = memoize({
      key: context.getFilename(),
      value: () => locateNearestPackageJsonDir(context.getFilename()),
    });

    const config = memoize({
      key: JSON.stringify({ key: "config", options: context.options, projectDir }),
      value: () => getConfigFromFileWithContext({ context, projectDir }),
    });

    return {
      TaggedTemplateExpression(tag) {
        check({ context, tag, config, projectDir });
      },
    };
  },
});
