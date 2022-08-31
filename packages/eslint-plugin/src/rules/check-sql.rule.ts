import { GenerateResult } from "@testsql/generate";
import { GenerateError, GenerateErrorOf } from "@testsql/generate/src/generate";
import { ESLintUtils, TSESLint, TSESTree } from "@typescript-eslint/utils";
import { either, json } from "fp-ts";
import { Either } from "fp-ts/lib/Either";
import { flow } from "fp-ts/lib/function";
import * as recast from "recast";
import { AnyAsyncFn, createSyncFn } from "synckit";
import { match } from "ts-pattern";
import z from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { ESTreeUtils } from "../utils";
import { locateNearestPackageJsonDir } from "../utils/node.utils";
import { mapTemplateLiteralToQueryText } from "../utils/ts-pg.utils";

const messages = {
  typeInferenceFailed: "Type inference failed {{error}}",
  invalidQuery: "Error: {{error}}",
  invalidMigration: "Error: {{error}}",
  missingTypeAnnotations: "Missing type annotations",
  incorrectTypeAnnotations: "Incorrect type annotations",
};

const baseConnectionSchema = z.object({
  name: z.string(),
  operators: z.array(z.string()),
});

const connectionByMigrationSchema = baseConnectionSchema.merge(
  z.object({
    migrationsDir: z.string(),
    connectionUrl: z.string().optional(),
    databaseName: z.string(),
  })
);

const connectionByDatabaseUrl = baseConnectionSchema.merge(
  z.object({
    databaseUrl: z.string(),
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

type MessageIds = keyof typeof messages;
export type RuleOptions = z.infer<typeof ruleOptionsSchema>;
export type RuleOptionConnection = RuleOptions[0]["connections"][number];
type RuleContext = Readonly<TSESLint.RuleContext<MessageIds, RuleOptions>>;

const workerPath = require.resolve("./check-sql.worker");

const generateSync = createSyncFn<AnyAsyncFn<either.Either<unknown, string>>>(workerPath, {
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

function checkByConnection(params: {
  context: RuleContext;
  connection: RuleOptionConnection;
  expr: TSESTree.TaggedTemplateExpression;
  projectDir: string;
}) {
  const { context, expr, projectDir, connection } = params;
  if (
    !ESTreeUtils.isIdentifier(expr.tag) ||
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

  const run = flow(
    () => mapTemplateLiteralToQueryText(sqlExpression.quasi, parserServices, checker),
    either.mapLeft(reportInvalidQuery),
    either.chain((query) => {
      return generateSync({ query, connection, projectDir });
    }),
    either.chain((stringified) => json.parse(stringified)),
    either.chain((parsed) => parsed as unknown as Either<unknown, GenerateResult>),
    either.fold(
      (error) => {
        return match(error as GenerateError)
          .with({ type: "DuplicateColumns" }, reportDuplicateColumns)
          .with({ type: "PostgresError" }, reportPostgresError)
          .with({ type: "MigrationError" }, reportMigrationError)
          .exhaustive();
      },
      (result) => {
        const isMissingTypeAnnotations = sqlOperatorType === undefined;

        if (isMissingTypeAnnotations) {
          return reportMissingTypeAnnotations(result);
        }

        if (isIncorrectTypeAnnotations(result, sqlOperatorType)) {
          return reportIncorrectTypeAnnotations(result, sqlOperatorType);
        }
      }
    )
  );

  run();

  function reportInvalidQuery(params: { node: TSESTree.Node; error: string }) {
    return context.report({
      messageId: "invalidQuery",
      node: params.node,
      data: { error: params.error },
    });
  }

  function reportDuplicateColumns(error: GenerateErrorOf<"DuplicateColumns">) {
    return context.report({
      node: sqlExpression,
      messageId: "invalidQuery",
      loc: ESTreeUtils.getSourceLocationFromStringPosition({
        loc: sqlExpression.loc,
        position: error.query.search(error.columnName) + 1,
        value: error.query,
      }),
      data: {
        error: JSON.stringify(error.error),
      },
    });
  }

  function reportPostgresError(error: GenerateErrorOf<"PostgresError">) {
    return context.report({
      node: sqlExpression,
      messageId: "invalidQuery",
      loc: ESTreeUtils.getSourceLocationFromStringPosition({
        loc: sqlExpression.loc,
        position: parseInt(error.position, 10),
        value: error.query,
      }),
      data: {
        error: error.error,
      },
    });
  }
  function reportMigrationError(error: GenerateErrorOf<"MigrationError">) {
    return context.report({
      node: sqlExpression,
      messageId: "invalidQuery",
      data: {
        error: error.error,
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

const createRule = ESLintUtils.RuleCreator(() => `https://github.com/Newbie012/testsql`)<
  RuleOptions,
  MessageIds
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
