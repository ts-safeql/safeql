import { GenerateResult } from "@testsql/generate";
import { GenerateError } from "@testsql/generate/src/generate";
import { ESLintUtils, ParserServices, TSESLint, TSESTree } from "@typescript-eslint/utils";
import { either, json } from "fp-ts";
import { Either } from "fp-ts/lib/Either";
import { flow } from "fp-ts/lib/function";
import * as recast from "recast";
import { AnyAsyncFn, createSyncFn } from "synckit";
import * as ts from "typescript";
import z from "zod";
import { getSourceLocationFromStringPosition } from "../utils";
import { assertNever } from "../utils/assertNever";
import { mapTemplateLiteralToQueryText } from "../utils/postgres.utils";
import { getBaseTypeOfLiteralType } from "../utils/ts.utils";

const messages = {
  typeInferenceFailed: "Type inference failed {{error}}",
  invalidQuery: "Error: {{error}}",
  queryMissingTypeAnnotations: "Query is missing type annotations",
  queryInvalidTypeAnnotations: "Query has invalid type annotations",
};

const ruleOptionsSchema = z
  .array(
    z.object({
      databaseUrl: z.string(),
    })
  )
  .min(1)
  .max(1);

type MessageIds = keyof typeof messages;
export type RuleOptions = z.infer<typeof ruleOptionsSchema>;

type RuleContext = Readonly<TSESLint.RuleContext<MessageIds, RuleOptions>>;

const workerPath = require.resolve("./check-sql.worker");

const syncGenerate = createSyncFn<AnyAsyncFn<either.Either<unknown, string>>>(workerPath, {
  tsRunner: "esbuild-register",
  timeout: 2000,
});

function check1(context: RuleContext, expr: TSESTree.TaggedTemplateExpression) {
  if (
    expr.tag.type === "Identifier" &&
    expr.tag.parent !== undefined &&
    expr.tag.parent.type === "TaggedTemplateExpression" &&
    expr.parent !== undefined &&
    expr.parent.type === "CallExpression" &&
    expr.parent.callee.type === "MemberExpression" &&
    expr.parent.callee.property.type === "Identifier" &&
    ["queryOne"].includes(expr.parent.callee.property.name)
  ) {
    const parserServices = ESLintUtils.getParserServices(context);
    const checker = parserServices?.program?.getTypeChecker();

    const tagParent = expr.tag.parent;
    const eitherQuery = mapTemplateLiteralToQueryText(tagParent.quasi, parserServices, checker);

    if (either.isLeft(eitherQuery)) {
      return context.report({
        messageId: "invalidQuery",
        node: eitherQuery.left.expr,
        data: {
          error: eitherQuery.left.error,
        },
      });
    }

    const queryText = eitherQuery.right;

    const typeResult = flow(
      () =>
        syncGenerate({
          ruleOptions: context.options[0],
          query: queryText,
        }),
      either.chain((stringified) => json.parse(stringified)),
      either.chain((parsed) => parsed as unknown as Either<unknown, GenerateResult>),
      either.map((result) => result.result),
      either.mapLeft((result) => result as GenerateError)
    )();

    if (either.isLeft(typeResult)) {
      switch (typeResult.left.type) {
        case "DuplicateColumns":
          return context.report({
            node: expr.tag.parent,
            messageId: "invalidQuery",
            loc: getSourceLocationFromStringPosition({
              loc: expr.loc,
              position: queryText.search(typeResult.left.columnName) + 1,
              value: queryText,
            }),
            data: {
              error: JSON.stringify(typeResult.left.error),
            },
          });
        case "PostgresError":
          return context.report({
            node: expr.tag.parent,
            messageId: "invalidQuery",
            loc: getSourceLocationFromStringPosition({
              loc: expr.loc,
              position: parseInt(typeResult.left.position, 10),
              value: queryText,
            }),
            data: {
              error: typeResult.left.error,
            },
          });
        default:
          assertNever(typeResult.left);
      }
    }

    const generatedType = typeResult.right;
    const calleeProperty = expr.parent.callee.property;

    if (expr.parent.typeParameters === undefined) {
      return context.report({
        node: expr.parent!.callee,
        messageId: "queryMissingTypeAnnotations",
        fix: (fixer) => {
          return fixer.replaceTextRange(
            [calleeProperty.range[0], calleeProperty.range[1]],
            `${calleeProperty.name}<${generatedType}>`
          );
        },
      });
    }

    const currentType = recast.print(expr.parent.typeParameters).code;

    const typeParameters = expr.parent.typeParameters;

    if (!areTypesEqual(currentType, generatedType)) {
      return context.report({
        node: expr.parent!.callee,
        messageId: "queryInvalidTypeAnnotations",
        fix: (fixer) => {
          return fixer.replaceTextRange(
            [typeParameters.range[0], typeParameters.range[1]],
            `<${generatedType}>`
          );
        },
      });
    }
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
    schema: {
      type: "array",
      items: {
        type: "object",
        properties: { databaseUrl: { type: "string" } },
        required: ["databaseUrl"],
        additionalProperties: false,
      },
      minItems: 1,
      maxItems: 1,
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      TaggedTemplateExpression(expr) {
        check1(context, expr);
      },
    };
  },
});
