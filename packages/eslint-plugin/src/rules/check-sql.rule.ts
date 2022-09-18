import { GenerateResult } from "@ts-safeql/generate";
import { PostgresError } from "@ts-safeql/shared";
import { ESLintUtils, TSESLint, TSESTree } from "@typescript-eslint/utils";
import pgParser from "libpg-query";
import * as recast from "recast";
import { createSyncFn } from "synckit";
import { match } from "ts-pattern";
import z from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { ESTreeUtils } from "../utils";
import { E, flow, J, pipe } from "../utils/fp-ts";
import { locateNearestPackageJsonDir } from "../utils/node.utils";
import { mapTemplateLiteralToQueryText } from "../utils/ts-pg.utils";
import { getConfigFromFileWithContext } from "./check-sql.config";
import {
  reportBaseError,
  reportDuplicateColumns,
  reportIncorrectTypeAnnotations,
  reportInvalidQueryError,
  reportMissingTypeAnnotations,
  reportPostgresError,
  withTransformType,
} from "./check-sql.utils";
import { WorkerError, WorkerParams, WorkerResult } from "./check-sql.worker";

const messages = {
  typeInferenceFailed: "Type inference failed {{error}}",
  error: "{{error}}",
  invalidQuery: "Invalid Query: {{error}}",
  missingTypeAnnotations: "Query is missing type annotation",
  incorrectTypeAnnotations: "Query has incorrect type annotation",
};
export type RuleMessage = keyof typeof messages;

const baseSchema = z.object({
  /**
   * Transform the end result of the type.
   *
   * For example:
   *  - `"${type}[]"` will transform the type to an array
   *  - `["Nullable", "Maybe"]` will replace `Nullable` with `Maybe` in the type
   *  - `["${type}[]", ["Nullable", "Maybe"]]` will do both
   */
  transform: z
    .union([z.string(), z.array(z.union([z.string(), z.tuple([z.string(), z.string()])]))])
    .optional(),

  /**
   * Whether or not keep the connection alive. Change it only if you know what you're doing.
   */
  keepAlive: z.boolean().optional(),
});

const identifyByNameAndOperators = z.object({
  /**
   * The name of the variable the holds the connection.
   *
   * For example "conn" for `conn.query(...)`
   */
  name: z.string(),

  /**
   * An array of operator names that executes raw queries inside the variable that holds the connection.
   *
   * For example ["$queryRaw", "$executeRaw"] for `Prisma.$queryRaw(...)` and `Prisma.$executeRaw(...)`
   */
  operators: z.array(z.string()),
});

const identifyByTagName = z.object({
  /**
   * The name of the tag that executes raw queries.
   *
   * For example "sql" for ```` sql`SELECT * FROM users`  ````
   */
  tagName: z.string(),
});

const connectByMigrationSchema = z.object({
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
  databaseName: z.string(),
});

const connectByDatabaseUrl = z.object({
  /**
   * The connection url to the database
   */
  databaseUrl: z.string(),
});

const RuleOptionConnection = z.union([
  baseSchema.merge(connectByMigrationSchema.merge(identifyByNameAndOperators)),
  baseSchema.merge(connectByMigrationSchema.merge(identifyByTagName)),
  baseSchema.merge(connectByDatabaseUrl.merge(identifyByNameAndOperators)),
  baseSchema.merge(connectByDatabaseUrl.merge(identifyByTagName)),
]);
export type RuleOptionConnection = z.infer<typeof RuleOptionConnection>;

export const Config = z.object({
  connections: z.union([z.array(RuleOptionConnection), RuleOptionConnection]),
});
export type Config = z.infer<typeof Config>;

export const UserConfigFile = z.object({ useConfigFile: z.boolean() });
export type UserConfigFile = z.infer<typeof UserConfigFile>;

export const Options = z.union([Config, UserConfigFile]);
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
  }
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
    checkConnection({ ...params, connection });
  }
}

function isTagMemberValid(
  expr: TSESTree.TaggedTemplateExpression
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

function getASTStartegyByConnection(connection: RuleOptionConnection) {
  if ("tagName" in connection) {
    return { strategy: "tag" as const, ...connection };
  }

  return { strategy: "call" as const, ...connection };
}

function checkConnection(params: {
  context: RuleContext;
  connection: RuleOptionConnection;
  tag: TSESTree.TaggedTemplateExpression;
  projectDir: string;
}) {
  const strategy = getASTStartegyByConnection(params.connection);

  return match(strategy)
    .with({ strategy: "tag" }, (connection) => {
      return checkConnectionByTagExpression({ ...params, connection });
    })
    .with({ strategy: "call" }, (connection) => {
      return checkConnectionByCallExpression({ ...params, connection });
    })
    .exhaustive();
}

const pgParseQueryE = (query: string) => {
  return pipe(
    E.tryCatch(
      () => pgParser.parseQuerySync(query),
      (error) => PostgresError.to(query, error)
    )
  );
};

const generateSyncE = flow(
  generateSync,
  E.chain(J.parse),
  E.chainW((parsed) => parsed as unknown as E.Either<WorkerError, WorkerResult>),
  E.mapLeft((error) => error as unknown as WorkerError)
);

function reportCheck(params: {
  context: RuleContext;
  tag: TSESTree.TaggedTemplateExpression;
  connection: RuleOptionConnection;
  projectDir: string;
  typeParameters: TSESTree.TSTypeParameterInstantiation | undefined;
  baseNode: TSESTree.BaseNode;
}) {
  const { context, tag, connection, projectDir, typeParameters, baseNode } = params;

  return pipe(
    E.Do,
    E.bind("parser", () => E.of(ESLintUtils.getParserServices(context))),
    E.bind("checker", ({ parser }) => E.of(parser.program.getTypeChecker())),
    E.bind("query", ({ parser, checker }) =>
      mapTemplateLiteralToQueryText(tag.quasi, parser, checker)
    ),
    E.bindW("pgParsed", ({ query }) => pgParseQueryE(query)),
    E.chainW(({ query, pgParsed }) => generateSyncE({ query, pgParsed, connection, projectDir })),
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
            }
          )
          .exhaustive();
      },
      (result) => {
        const isMissingTypeAnnotations = typeParameters === undefined;
        const resultWithTransformed = withTransformType(result, connection.transform);

        if (isMissingTypeAnnotations) {
          return reportMissingTypeAnnotations({
            tag: tag,
            context: context,
            baseNode: baseNode,
            result: resultWithTransformed,
          });
        }

        if (isIncorrectTypeAnnotations(resultWithTransformed, typeParameters)) {
          return reportIncorrectTypeAnnotations({
            context,
            result: resultWithTransformed,
            typeParameters: typeParameters,
          });
        }
      }
    )
  );
}

function checkConnectionByTagExpression(params: {
  context: RuleContext;
  connection: RuleOptionConnection & z.infer<typeof identifyByTagName>;
  tag: TSESTree.TaggedTemplateExpression;
  projectDir: string;
}) {
  const { context, tag, projectDir, connection } = params;

  if (
    (ESTreeUtils.isIdentifier(tag.tag) && tag.tag.name === connection.tagName) ||
    (ESTreeUtils.isMemberExpression(tag.tag) &&
      ESTreeUtils.isIdentifier(tag.tag.object) &&
      ESTreeUtils.isIdentifier(tag.tag.property) &&
      ESTreeUtils.isEqual(connection.tagName, `${tag.tag.object.name}.${tag.tag.property.name}`))
  ) {
    return reportCheck({
      context,
      tag,
      connection,
      projectDir,
      baseNode: tag.tag,
      typeParameters: tag.typeParameters,
    });
  }
}

function checkConnectionByCallExpression(params: {
  context: RuleContext;
  connection: RuleOptionConnection & z.infer<typeof identifyByNameAndOperators>;
  tag: TSESTree.TaggedTemplateExpression;
  projectDir: string;
}) {
  const { context, tag, projectDir, connection } = params;

  if (
    isTagMemberValid(tag) &&
    ESTreeUtils.isCallExpression(tag.parent) &&
    ESTreeUtils.isMemberExpression(tag.parent.callee) &&
    ESTreeUtils.isIdentifier(tag.parent.callee.object) &&
    ESTreeUtils.isEqual(tag.parent.callee.object.name, connection.name) &&
    ESTreeUtils.isIdentifier(tag.parent.callee.property) &&
    ESTreeUtils.isOneOf(tag.parent.callee.property.name, connection.operators)
  ) {
    return reportCheck({
      context,
      tag,
      connection,
      projectDir,
      baseNode: tag.parent.callee,
      typeParameters: tag.parent.typeParameters,
    });
  }
}

function isIncorrectTypeAnnotations(
  { result }: GenerateResult,
  sqlOperatorType: TSESTree.TSTypeParameterInstantiation
) {
  const currentType = recast.print(sqlOperatorType).code;

  return !areTypesEqual(currentType, result);
}

// TODO this should be improved.
function areTypesEqual(current: string, generated: string | null) {
  if (generated === null) {
    return false;
  }

  const omitRegex = /[\n ;]/g;

  return current.replace(omitRegex, "") === `<${generated}>`.replace(omitRegex, "");
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
    schema: zodToJsonSchema(RuleOptions, { target: "openApi3" }),
  },
  defaultOptions: [],
  create(context) {
    const projectDir = locateNearestPackageJsonDir(context.getFilename());
    const config = getConfigFromFileWithContext({ context, projectDir });

    return {
      TaggedTemplateExpression(tag) {
        check({ context, tag, config, projectDir });
      },
    };
  },
});
