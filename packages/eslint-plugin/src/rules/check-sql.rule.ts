import { GenerateResult } from "@ts-safeql/generate";
import {
  DuplicateColumnsError,
  InternalError,
  InvalidQueryError,
  PostgresError,
} from "@ts-safeql/shared";
import { ESLintUtils, TSESLint, TSESTree } from "@typescript-eslint/utils";
import { either, json } from "fp-ts";
import { Either } from "fp-ts/lib/Either";
import { flow, identity, pipe } from "fp-ts/lib/function";
import pgParser from "libpg-query";
import * as recast from "recast";
import { createSyncFn } from "synckit";
import { match } from "ts-pattern";
import z from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { ESTreeUtils } from "../utils";
import { locateNearestPackageJsonDir } from "../utils/node.utils";
import { mapTemplateLiteralToQueryText } from "../utils/ts-pg.utils";
import { withTransformType } from "./check-sql.utils";
import { WorkerError, WorkerParams, WorkerResult } from "./check-sql.worker";

const messages = {
  typeInferenceFailed: "Type inference failed {{error}}",
  error: "{{error}}",
  invalidQuery: "Invalid Query: {{error}}",
  missingTypeAnnotations: "Query is missing type annotation",
  incorrectTypeAnnotations: "Query has incorrect type annotation",
};

const baseConnectionSchema = z.object({
  name: z.string(),
  operators: z.array(z.string()),
  transform: z
    .union([z.string(), z.array(z.union([z.string(), z.tuple([z.string(), z.string()])]))])
    .optional(),
});

const connectionByMigrationSchema = baseConnectionSchema.merge(
  z.object({
    migrationsDir: z.string(),
    connectionUrl: z.string().optional(),
    databaseName: z.string(),
    keepAlive: z.boolean().optional(),
  })
);

const connectionByDatabaseUrl = baseConnectionSchema.merge(
  z.object({
    databaseUrl: z.string(),
    keepAlive: z.boolean().optional(),
  })
);

const ruleOptionsSchema = z
  .array(
    z.object({
      connections: z.array(z.union([connectionByDatabaseUrl, connectionByMigrationSchema])),
    })
  )
  .min(1)
  .max(1);

export type RuleMessage = keyof typeof messages;
export type RuleOptions = z.infer<typeof ruleOptionsSchema>;
export type RuleOptionConnection = RuleOptions[0]["connections"][number];
type RuleContext = Readonly<TSESLint.RuleContext<RuleMessage, RuleOptions>>;

const workerPath = require.resolve("./check-sql.worker");

const generateSync = createSyncFn<
  (params: WorkerParams) => Promise<either.Either<unknown, string>>
>(workerPath, {
  tsRunner: "esbuild-register",
  timeout: 1000 * 60 * 5,
});

function check(params: {
  context: RuleContext;
  expr: TSESTree.TaggedTemplateExpression;
  projectDir: string;
}) {
  for (const connection of params.context.options[0].connections) {
    checkByConnection({ ...params, connection });
  }
}

function isTagMemberValid(expr: TSESTree.TaggedTemplateExpression) {
  // For example conn.query(sql``)
  if (ESTreeUtils.isIdentifier(expr.tag)) {
    return true;
  }

  // For example conn.query(Provider.sql``)
  if (ESTreeUtils.isMemberExpression(expr.tag) && ESTreeUtils.isIdentifier(expr.tag.property)) {
    return true;
  }

  return false;
}

function checkByConnection(params: {
  context: RuleContext;
  connection: RuleOptionConnection;
  expr: TSESTree.TaggedTemplateExpression;
  projectDir: string;
}) {
  const { context, expr, projectDir, connection } = params;
  if (
    !isTagMemberValid(expr) ||
    !ESTreeUtils.isCallExpression(expr.parent) ||
    !ESTreeUtils.isMemberExpression(expr.parent.callee) ||
    !ESTreeUtils.isIdentifier(expr.parent.callee.object) ||
    !ESTreeUtils.isEqual(expr.parent.callee.object.name, connection.name) ||
    !ESTreeUtils.isIdentifier(expr.parent.callee.property) ||
    !ESTreeUtils.isOneOf(expr.parent.callee.property.name, connection.operators)
  ) {
    return;
  }

  const sqlExpression = expr;
  const sqlOperator = expr.parent.callee;
  const sqlOperatorName = expr.parent.callee.property;
  const sqlOperatorType = expr.parent.typeParameters;

  const parserServices = ESLintUtils.getParserServices(context);
  const checker = parserServices?.program?.getTypeChecker();

  const generateEither = flow(
    generateSync,
    either.chain(json.parse),
    either.chainW((parsed) => parsed as unknown as Either<WorkerError, WorkerResult>),
    either.mapLeft((error) => error as unknown as WorkerError)
  );

  const pgParseQuery = flow(pgParser.parseQuerySync, either.tryCatchK(identity, InternalError.to));

  pipe(
    either.Do,
    either.bind("query", () =>
      mapTemplateLiteralToQueryText(sqlExpression.quasi, parserServices, checker)
    ),
    either.bindW("pgParsed", ({ query }) => pgParseQuery(query)),
    either.chainW(({ query, pgParsed }) =>
      generateEither({ query, pgParsed, connection, projectDir })
    ),
    either.fold(
      (error) => {
        return match(error)
          .with({ _tag: "DuplicateColumnsError" }, reportDuplicateColumns)
          .with({ _tag: "PostgresError" }, reportPostgresError)
          .with({ _tag: "InvalidMigrationError" }, reportBaseError)
          .with({ _tag: "InvalidMigrationsPathError" }, reportBaseError)
          .with({ _tag: "DatabaseInitializationError" }, reportBaseError)
          .with({ _tag: "InternalError" }, reportBaseError)
          .with({ _tag: "InvalidQueryError" }, reportInvalidQueryError)
          .exhaustive();
      },

      (result) => {
        const isMissingTypeAnnotations = sqlOperatorType === undefined;
        const resultWithTransformed = withTransformType(result, connection.transform);

        if (isMissingTypeAnnotations) {
          return reportMissingTypeAnnotations(resultWithTransformed);
        }

        if (isIncorrectTypeAnnotations(resultWithTransformed, sqlOperatorType)) {
          return reportIncorrectTypeAnnotations(resultWithTransformed, sqlOperatorType);
        }
      }
    )
  );

  function reportInvalidQueryError(error: InvalidQueryError) {
    return context.report({
      messageId: "invalidQuery",
      node: error.node,
      data: { error: error.message },
    });
  }

  function reportBaseError(error: WorkerError) {
    return context.report({
      node: sqlExpression,
      messageId: "error",
      data: {
        error: error.message,
      },
    });
  }

  function reportDuplicateColumns(error: DuplicateColumnsError) {
    return context.report({
      node: sqlExpression,
      messageId: "invalidQuery",
      loc: ESTreeUtils.getSourceLocationFromStringPosition({
        loc: sqlExpression.loc,
        position: error.queryText.search(error.columns[0]) + 1,
        value: error.queryText,
      }),
      data: {
        error: error.message,
      },
    });
  }

  function reportPostgresError(error: PostgresError) {
    return context.report({
      node: sqlExpression,
      messageId: "invalidQuery",
      loc: ESTreeUtils.getSourceLocationFromStringPosition({
        loc: sqlExpression.loc,
        position: parseInt(error.position, 10),
        value: error.queryText,
      }),
      data: {
        error: error.message,
      },
    });
  }

  function reportMissingTypeAnnotations(result: GenerateResult) {
    return context.report({
      node: sqlOperator,
      messageId: "missingTypeAnnotations",
      fix: (fixer) => {
        return fixer.replaceTextRange(
          [sqlOperatorName.range[0], sqlOperatorName.range[1]],
          `${sqlOperatorName.name}<${result.result}>`
        );
      },
    });
  }

  function reportIncorrectTypeAnnotations(
    { result }: GenerateResult,
    sqlOperatorType: TSESTree.TSTypeParameterInstantiation
  ) {
    return context.report({
      node: sqlOperatorType.params[0],
      messageId: "incorrectTypeAnnotations",
      fix: (fixer) => {
        return fixer.replaceTextRange(
          [sqlOperatorType.range[0], sqlOperatorType.range[1]],
          `<${result}>`
        );
      },
    });
  }

  function isIncorrectTypeAnnotations(
    { result }: GenerateResult,
    sqlOperatorType: TSESTree.TSTypeParameterInstantiation
  ) {
    const currentType = recast.print(sqlOperatorType).code;

    return !areTypesEqual(currentType, result);
  }
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
    schema: zodToJsonSchema(ruleOptionsSchema, { target: "openApi3" }),
  },
  defaultOptions: [],
  create(context) {
    const projectDir = locateNearestPackageJsonDir(context.getFilename());

    return {
      TaggedTemplateExpression(expr) {
        check({ context, expr, projectDir });
      },
    };
  },
});
