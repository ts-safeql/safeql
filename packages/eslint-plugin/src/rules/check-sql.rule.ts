import { ResolvedTarget } from "@ts-safeql/generate";
import {
  InvalidConfigError,
  PostgresError,
  QuerySourceMapEntry,
  doesMatchPattern,
  fmap,
} from "@ts-safeql/shared";
import {
  ESLintUtils,
  ParserServices,
  ParserServicesWithTypeInformation,
  TSESLint,
  TSESTree,
} from "@typescript-eslint/utils";
import { JSONSchema4 } from "@typescript-eslint/utils/json-schema";
import parser from "libpg-query";
import { match } from "ts-pattern";
import ts from "typescript";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ESTreeUtils } from "../utils";
import { E, J, flow, pipe } from "../utils/fp-ts";
import { getResolvedTargetByTypeNode } from "../utils/get-resolved-target-by-type-node";
import { memoize } from "../utils/memoize";
import { locateNearestPackageJsonDir } from "../utils/node.utils";
import { mapTemplateLiteralToQueryText } from "../utils/ts-pg.utils";
import { workers } from "../workers";
import { WorkerError, WorkerResult } from "../workers/check-sql.worker";
import {
  Config,
  ConnectionTarget,
  InferLiteralsOption,
  RuleOptionConnection,
  RuleOptions,
  TagTarget,
  WrapperTarget,
  defaultInferLiteralOptions,
} from "./RuleOptions";
import { getConfigFromFileWithContext } from "./check-sql.config";
import {
  TypeTransformer,
  getFinalResolvedTargetString,
  getResolvedTargetComparableString,
  getResolvedTargetString,
  reportBaseError,
  reportDuplicateColumns,
  reportIncorrectTypeAnnotations,
  reportInvalidConfig,
  reportInvalidQueryError,
  reportInvalidTypeAnnotations,
  reportMissingTypeAnnotations,
  reportPostgresError,
  shouldLintFile,
  transformTypes,
} from "./check-sql.utils";

const messages = {
  typeInferenceFailed: "Type inference failed {{error}}",
  error: "{{error}}",
  invalidQuery: "Invalid Query: {{error}}",
  missingTypeAnnotations: "Query is missing type annotation\n\tFix with: {{fix}}",
  incorrectTypeAnnotations: `Query has incorrect type annotation.\n\tExpected: {{expected}}\n\t  Actual: {{actual}}`,
  invalidTypeAnnotations: `Query has invalid type annotation (SafeQL does not support it. If you think it should, please open an issue)`,
};
export type RuleMessage = keyof typeof messages;

export type RuleContext = Readonly<TSESLint.RuleContext<RuleMessage, RuleOptions>>;

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

const pgParseQueryE = (query: string, sourcemaps: QuerySourceMapEntry[]) => {
  return pipe(
    E.tryCatch(
      () => parser.parseQuerySync(query),
      (error) => PostgresError.to(query, error, sourcemaps),
    ),
  );
};

const generateSyncE = flow(
  workers.generateSync,
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

  const nullAsOptional = connection.nullAsOptional ?? false;
  const nullAsUndefined = connection.nullAsUndefined ?? false;

  return pipe(
    E.Do,
    E.bind("parser", () => {
      return hasParserServicesWithTypeInformation(context.sourceCode.parserServices)
        ? E.right(context.sourceCode.parserServices)
        : E.left(new InvalidConfigError("Parser services are not available"));
    }),
    E.bind("checker", ({ parser }) => {
      return !parser.program
        ? E.left(new InvalidConfigError("Type checker is not available"))
        : E.right(parser.program.getTypeChecker());
    }),
    E.bindW("query", ({ parser, checker }) =>
      mapTemplateLiteralToQueryText(
        tag.quasi,
        parser,
        checker,
        params.connection,
        params.context.sourceCode,
      ),
    ),
    E.bindW("pgParsed", ({ query }) => pgParseQueryE(query.text, query.sourcemaps)),
    E.bindW("result", ({ query, pgParsed }) => {
      return generateSyncE({ query, pgParsed, connection, target, projectDir });
    }),
    E.fold(
      (error) => {
        return match(error)
          .with({ _tag: "InvalidConfigError" }, (error) => {
            return reportInvalidConfig({ context, error, tag });
          })
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

        if (isMissingTypeAnnotations) {
          if (result.output === null) {
            return;
          }

          return reportMissingTypeAnnotations({
            tag: tag,
            context: context,
            baseNode: baseNode,
            actual: getFinalResolvedTargetString({
              target: result.output,
              nullAsOptional: nullAsOptional ?? false,
              nullAsUndefined: nullAsUndefined ?? false,
              transform: target.transform,
              inferLiterals: connection.inferLiterals ?? defaultInferLiteralOptions,
            }),
          });
        }

        const reservedTypes = memoize({
          key: `reserved-types:${JSON.stringify(connection.overrides)}`,
          value: () => {
            const types = new Set<string>();

            for (const value of Object.values(connection.overrides?.types ?? {})) {
              types.add(typeof value === "string" ? value : value.return);
            }

            for (const columnType of Object.values(connection.overrides?.columns ?? {})) {
              types.add(columnType);
            }

            return types;
          },
        });

        const typeAnnotationState = getTypeAnnotationState({
          generated: result.output,
          typeParameter: typeParameter,
          transform: target.transform,
          checker: checker,
          parser: parser,
          reservedTypes: reservedTypes,
          nullAsOptional: nullAsOptional,
          nullAsUndefined: nullAsUndefined,
          inferLiterals: connection.inferLiterals ?? defaultInferLiteralOptions,
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
            expected: fmap(typeAnnotationState.expected, (expected) =>
              getResolvedTargetString({
                target: expected,
                nullAsOptional: false,
                nullAsUndefined: false,
                inferLiterals: params.connection.inferLiterals ?? defaultInferLiteralOptions,
              }),
            ),
            actual: fmap(result.output, (output) =>
              getFinalResolvedTargetString({
                target: output,
                nullAsOptional: connection.nullAsOptional ?? false,
                nullAsUndefined: connection.nullAsUndefined ?? false,
                transform: target.transform,
                inferLiterals: connection.inferLiterals ?? defaultInferLiteralOptions,
              }),
            ),
          });
        }
      },
    ),
  );
}

function hasParserServicesWithTypeInformation(
  parser: Partial<ParserServices> | undefined,
): parser is ParserServicesWithTypeInformation {
  return parser !== undefined && parser.program !== null;
}

function checkConnectionByTagExpression(params: {
  context: RuleContext;
  connection: RuleOptionConnection;
  target: TagTarget;
  tag: TSESTree.TaggedTemplateExpression;
  projectDir: string;
}) {
  const { context, tag, projectDir, connection, target } = params;

  const tagAsText = context.sourceCode.getText(tag.tag).replace(/^this\./, "");

  if (doesMatchPattern({ pattern: target.tag, text: tagAsText })) {
    return reportCheck({
      context,
      tag,
      connection,
      target,
      projectDir,
      baseNode: tag.tag,
      typeParameter: tag.typeArguments,
    });
  }
}

function getValidParentUntilDepth(node: TSESTree.Node, depth: number) {
  if (node.type === "CallExpression" && node.callee.type === "MemberExpression") {
    return node;
  }

  if (depth > 0 && node.parent) {
    return getValidParentUntilDepth(node.parent, depth - 1);
  }

  return null;
}

function checkConnectionByWrapperExpression(params: {
  context: RuleContext;
  connection: RuleOptionConnection;
  target: WrapperTarget;
  tag: TSESTree.TaggedTemplateExpression;
  projectDir: string;
}) {
  const { context, tag, projectDir, connection, target } = params;

  if (!isTagMemberValid(tag)) {
    return;
  }

  const wrapperNode = getValidParentUntilDepth(tag.parent, target.maxDepth ?? 0);

  if (wrapperNode === null) {
    return;
  }

  const calleeAsText = context.sourceCode.getText(wrapperNode.callee).replace(/^this\./, "");

  if (doesMatchPattern({ pattern: target.wrapper, text: calleeAsText })) {
    return reportCheck({
      context,
      tag,
      connection,
      target,
      projectDir,
      baseNode: wrapperNode.callee,
      typeParameter: wrapperNode.typeArguments,
    });
  }
}

type GetTypeAnnotationStateParams = {
  generated: ResolvedTarget | null;
  typeParameter: TSESTree.TSTypeParameterInstantiation;
  transform?: TypeTransformer;
  parser: ParserServices;
  checker: ts.TypeChecker;
  reservedTypes: Set<string>;
  nullAsOptional: boolean;
  nullAsUndefined: boolean;
  inferLiterals: InferLiteralsOption;
};

function getTypeAnnotationState({
  generated,
  typeParameter,
  transform,
  parser,
  checker,
  reservedTypes,
  nullAsOptional,
  nullAsUndefined,
  inferLiterals,
}: GetTypeAnnotationStateParams) {
  if (typeParameter.params.length !== 1) {
    return "INVALID" as const;
  }

  const typeNode = typeParameter.params[0];

  const expected = getResolvedTargetByTypeNode({
    checker,
    parser,
    typeNode,
    reservedTypes,
  });

  return getResolvedTargetsEquality({
    expected,
    generated,
    nullAsOptional,
    nullAsUndefined,
    inferLiterals,
    transform,
  });
}

function getResolvedTargetsEquality(params: {
  expected: ResolvedTarget | null;
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

  let expectedString = getResolvedTargetComparableString({
    target: params.expected,
    nullAsOptional: false,
    nullAsUndefined: false,
    inferLiterals: params.inferLiterals,
  });

  let generatedString = getResolvedTargetComparableString({
    target: params.generated,
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

  expectedString = expectedString.split(", ").sort().join(", ");
  generatedString = generatedString.split(", ").sort().join(", ");

  if (params.transform !== undefined) {
    generatedString = transformTypes(generatedString, params.transform);
  }

  return {
    isEqual: expectedString === generatedString,
    expected: params.expected,
    generated: params.generated,
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
    },
    messages: messages,
    type: "problem",
    schema: zodToJsonSchema(RuleOptions, { target: "openApi3" }) as JSONSchema4,
  },
  defaultOptions: [],
  create(context) {
    if (!shouldLintFile(context)) {
      return {};
    }

    const projectDir = memoize({
      key: context.filename,
      value: () => locateNearestPackageJsonDir(context.filename),
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
