import { ResolvedTarget } from "@ts-safeql/generate";
import {
  PluginManager,
  type PluginResolvedTarget,
  type SafeQLPlugin,
  type QuerySourceMapEntry,
  type TargetContext,
  type TargetMatch,
} from "@ts-safeql/plugin-utils";
import { InvalidConfigError, deepMergeDefaults, doesMatchPattern, fmap } from "@ts-safeql/shared";
import {
  ESLintUtils,
  ParserServices,
  ParserServicesWithTypeInformation,
  TSESLint,
  TSESTree,
} from "@typescript-eslint/utils";
import { JSONSchema4 } from "@typescript-eslint/utils/json-schema";
import { match } from "ts-pattern";
import ts from "typescript";
import { ESTreeUtils } from "../utils";
import { E, J, flow, pipe } from "../utils/fp-ts";
import {
  ExpectedResolvedTarget,
  getResolvedTargetByType,
  getResolvedTargetByTypeNode,
} from "../utils/get-resolved-target-by-type-node";
import { isInEditorEnv } from "../utils/is-in-editor";
import { memoize } from "../utils/memoize";
import { locateNearestPackageJsonDir } from "../utils/node.utils";
import { hasParserServicesWithTypeInformation } from "../utils/parser-services";
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
  getResolvedTargetsEquality,
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
} from "./check-sql.utils";
import z from "zod";

const messages = {
  typeInferenceFailed: "Type inference failed {{error}}",
  error: "{{error}}",
  invalidQuery: "Invalid Query: {{error}}",
  missingTypeAnnotations: "Query is missing type annotation\n\tFix with: {{fix}}",
  incorrectTypeAnnotations: `Query has incorrect type annotation.\n\tExpected: {{expected}}\n\t  Actual: {{actual}}`,
  invalidTypeAnnotations: `Query has invalid type annotation (SafeQL does not support it. If you think it should, please open an issue)`,
  pluginError: `{{error}}`,
  pluginSuggestion: "Apply suggested plugin fix",
};
export type RuleMessage = keyof typeof messages;

export type RuleContext = Readonly<TSESLint.RuleContext<RuleMessage, RuleOptions>>;

interface PluginContext {
  plugins: SafeQLPlugin[];
  targetMatch: TargetMatch | false | undefined;
}

type CheckNode = TSESTree.Node;

type TerminalCallQuery = {
  text: string;
  sourcemaps: QuerySourceMapEntry[];
  expectedType?: ts.Node;
};

const terminalBuilderMethods = new Set([
  "execute",
  "executeTakeFirst",
  "executeTakeFirstOrThrow",
  "compile",
  "stream",
]);

function check(params: {
  context: RuleContext;
  config: Config;
  tag: CheckNode;
  projectDir: string;
}) {
  const connections = Array.isArray(params.config.connections)
    ? params.config.connections
    : [params.config.connections];

  for (const rawConnection of connections) {
    const plugins = resolveConnectionPlugins(rawConnection, params.projectDir);
    const connection = applyPluginDefaults(rawConnection, plugins);
    const targetCtx = plugins.length > 0 ? getTargetContext(params.context) : undefined;
    const targetMatch =
      params.tag.type === "TaggedTemplateExpression"
        ? resolvePluginTargetMatch(plugins, params.tag, targetCtx)
        : undefined;
    const pluginCtx: PluginContext = { plugins, targetMatch };

    const targets = connection.targets ?? [];

    if (params.tag.type === "CallExpression" && !isTerminalBuilderCall(params.tag)) {
      continue;
    }

    if (targets.length === 0 && targetMatch) {
      reportCheck({
        ...params,
        tag: params.tag,
        connection,
        target: {
          tag: { regex: ".*" },
          skipTypeAnnotations: targetMatch.skipTypeAnnotations,
        },
        pluginCtx,
        baseNode: getBaseNodeFromCheckNode(params.tag),
        typeParameter:
          params.tag.type === "TaggedTemplateExpression" ? params.tag.typeArguments : undefined,
      });
    }

    if (targets.length === 0 && params.tag.type === "CallExpression") {
      const query = resolveQueryFromPlugins({
        node: params.tag,
        plugins,
        context: params.context,
      });

      if (query === undefined) {
        continue;
      }

      // A builder query resolves to a single SQL string regardless of connection
      // (there is no tag/target to match on), so it is validated against the
      // first connection whose plugins resolve it — one query yields one report.
      return reportCheck({
        context: params.context,
        projectDir: params.projectDir,
        connection,
        tag: params.tag,
        target: {
          tag: { regex: ".*" },
        },
        baseNode: getBaseNodeFromCheckNode(params.tag),
        typeParameter: params.tag.typeArguments,
        query,
      });
    }

    if (targets.length > 0) {
      for (const target of targets) {
        if (params.tag.type === "TaggedTemplateExpression") {
          checkConnection({ ...params, tag: params.tag, connection, target, pluginCtx });
        }
      }
    }
  }
}

function isTerminalBuilderCall(node: TSESTree.CallExpression) {
  if (node.callee.type !== "MemberExpression") {
    return false;
  }

  if (node.callee.computed) {
    return false;
  }

  return (
    ESTreeUtils.isIdentifier(node.callee.property) &&
    terminalBuilderMethods.has(node.callee.property.name)
  );
}

function getBaseNodeFromCheckNode(node: CheckNode): TSESTree.Node {
  if (node.type === "TaggedTemplateExpression") {
    return node.tag;
  }

  if (node.type === "CallExpression") {
    return node.callee;
  }

  return node;
}

function resolveQueryFromPlugins(params: {
  node: TSESTree.Node;
  plugins: SafeQLPlugin[];
  context: RuleContext;
}): TerminalCallQuery | undefined {
  const targetCtx = getTargetContext(params.context);
  if (targetCtx === undefined) {
    return undefined;
  }

  const tsNode = targetCtx.parser.esTreeNodeToTSNodeMap.get(params.node);
  if (!tsNode) {
    return undefined;
  }

  const tsType = targetCtx.checker.getTypeAtLocation(tsNode);

  for (const plugin of params.plugins) {
    if (!plugin.queryNodeKinds?.includes("CallExpression") || !plugin.resolveQuery) {
      continue;
    }

    const result = plugin.resolveQuery({
      checker: targetCtx.checker,
      parser: targetCtx.parser,
      precedingSQL: "",
      tsNode,
      tsType,
      tsTypeText: targetCtx.checker.typeToString(tsType),
    });

    if (result === "skip" || result === undefined) {
      continue;
    }

    return {
      text: result.text,
      sourcemaps: result.sourcemaps,
      expectedType: result.expectedType,
    };
  }

  return undefined;
}

function isTagMemberValid(
  expr: TSESTree.TaggedTemplateExpression,
): expr is TSESTree.TaggedTemplateExpression &
  (
    | { tag: TSESTree.Identifier }
    | { tag: TSESTree.MemberExpression & { property: TSESTree.Identifier } }
    | { tag: TSESTree.CallExpression }
  ) {
  if (ESTreeUtils.isIdentifier(expr.tag)) {
    return true;
  }

  if (ESTreeUtils.isMemberExpression(expr.tag) && ESTreeUtils.isIdentifier(expr.tag.property)) {
    return true;
  }

  if (expr.tag.type === "CallExpression") {
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
  pluginCtx: PluginContext;
}) {
  if (params.pluginCtx.targetMatch === false) {
    return;
  }

  if (params.pluginCtx.targetMatch !== undefined) {
    const target: ConnectionTarget = {
      ...params.target,
      skipTypeAnnotations:
        params.pluginCtx.targetMatch.skipTypeAnnotations ?? params.target.skipTypeAnnotations,
    };
    return reportCheck({
      context: params.context,
      tag: params.tag,
      connection: params.connection,
      target,
      projectDir: params.projectDir,
      baseNode: params.tag.tag,
      typeParameter: params.tag.typeArguments,
      pluginCtx: params.pluginCtx,
    });
  }

  if ("tag" in params.target) {
    return checkConnectionByTagExpression({ ...params, target: params.target });
  }

  if ("wrapper" in params.target) {
    return checkConnectionByWrapperExpression({ ...params, target: params.target });
  }

  return match(params.target).exhaustive();
}

const generateSyncE = flow(
  workers.generateSync,
  E.chain(J.parse),
  E.chainW((parsed) => parsed as unknown as E.Either<WorkerError, WorkerResult>),
  E.mapLeft((error) => error as unknown as WorkerError),
);

let fatalError: WorkerError | undefined;

const pluginManager = new PluginManager();

function resolveConnectionPlugins(
  connection: RuleOptionConnection,
  projectDir: string,
): SafeQLPlugin[] {
  if (!("plugins" in connection) || !connection.plugins?.length) {
    return [];
  }

  return pluginManager.resolvePluginsSync(connection.plugins, projectDir);
}

function applyPluginDefaults(
  connection: RuleOptionConnection,
  plugins: SafeQLPlugin[],
): RuleOptionConnection {
  let merged = connection;
  for (const plugin of plugins) {
    if (plugin.connectionDefaults) {
      merged = deepMergeDefaults(merged, plugin.connectionDefaults);
    }
  }
  return merged;
}

function getTargetContext(context: RuleContext): TargetContext | undefined {
  const services = context.sourceCode.parserServices;
  if (!hasParserServicesWithTypeInformation(services)) return undefined;
  const checker = services.program?.getTypeChecker();
  if (!checker) return undefined;
  return { checker, parser: services };
}

function resolvePluginTargetMatch(
  plugins: SafeQLPlugin[],
  tag: TSESTree.TaggedTemplateExpression,
  targetCtx: TargetContext | undefined,
): TargetMatch | false | undefined {
  if (!targetCtx) return undefined;

  for (const plugin of plugins) {
    const result = plugin.onTarget?.({ node: tag, context: targetCtx });
    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}

function reportPluginTypeCheck(params: {
  context: RuleContext;
  tag: TSESTree.TaggedTemplateExpression;
  connection: RuleOptionConnection;
  checker: ts.TypeChecker;
  parser: ParserServices;
  output: PluginResolvedTarget;
  typeCheck: NonNullable<TargetMatch["typeCheck"]>;
}): void {
  const { context, tag, connection, checker, parser, output, typeCheck } = params;

  const nullAsOptional = connection.nullAsOptional ?? false;
  const nullAsUndefined = connection.nullAsUndefined ?? false;
  const enforceType = connection.enforceType ?? "fix";

  const report = typeCheck({
    node: tag,
    output,
    checker,
    parser,
    sourceCode: context.sourceCode,
    getComparableString: (target) =>
      getResolvedTargetComparableString({
        target: target as ExpectedResolvedTarget,
        nullAsOptional,
        nullAsUndefined,
        inferLiterals: connection.inferLiterals ?? defaultInferLiteralOptions,
      }),
  });

  if (!report) return;

  const reportNode = report.node ?? tag.tag;
  const reportData = { error: report.message };
  const reportFixData = report.fix;
  const reportFix = reportFixData
    ? (fixer: TSESLint.RuleFixer) => fixer.replaceText(reportFixData.node, reportFixData.text)
    : undefined;

  if (!reportFix || enforceType === "fix") {
    context.report({
      node: reportNode,
      messageId: "pluginError",
      data: reportData,
      fix: reportFix,
    });
    return;
  }

  context.report({
    node: reportNode,
    messageId: "pluginError",
    data: reportData,
    suggest: [
      {
        messageId: "pluginSuggestion",
        data: reportData,
        fix: reportFix,
      },
    ],
  });
}

function reportCheck(params: {
  context: RuleContext;
  tag: CheckNode;
  connection: RuleOptionConnection;
  target: ConnectionTarget;
  projectDir: string;
  typeParameter?: TSESTree.TSTypeParameterInstantiation;
  baseNode: TSESTree.Node;
  query?: TerminalCallQuery;
  pluginCtx?: PluginContext;
}) {
  const {
    context,
    tag,
    connection,
    target,
    projectDir,
    typeParameter,
    baseNode,
    query: overrideQuery,
  } = params;
  const queryTypeParameter = typeParameter;
  const queryExpectedType = overrideQuery?.expectedType;

  if (fatalError !== undefined) {
    const hint = isInEditorEnv()
      ? "If you think this is a bug, please open an issue. If not, please try to fix the error and restart ESLint."
      : "If you think this is a bug, please open an issue.";

    return reportBaseError({ context, error: fatalError, tag, hint });
  }

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
      overrideQuery !== undefined
        ? E.right(overrideQuery)
        : tag.type === "TaggedTemplateExpression"
          ? mapTemplateLiteralToQueryText(
              tag.quasi,
              parser,
              checker,
              params.connection,
              params.context.sourceCode,
              params.pluginCtx?.plugins,
            )
          : E.right(null),
    ),
    E.bindW("result", ({ query }) => {
      if (query === null) {
        return E.right(null);
      }
      return generateSyncE({ query, connection, target, projectDir });
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
            { _tag: "PluginError" },
            (error) => {
              if (params.connection.keepAlive === true) {
                fatalError = error;
              }

              return reportBaseError({ context, error, tag });
            },
          )
          .exhaustive();
      },
      ({ result, checker, parser }) => {
        if (result === null) {
          return;
        }

        const pluginTypeCheck =
          params.pluginCtx?.targetMatch && params.pluginCtx.targetMatch.typeCheck;

        if (pluginTypeCheck && result.output && tag.type === "TaggedTemplateExpression") {
          return reportPluginTypeCheck({
            context,
            tag,
            connection,
            checker,
            parser,
            output: result.output,
            typeCheck: pluginTypeCheck,
          });
        }

        const shouldSkipTypeAnnotations = target.skipTypeAnnotations === true;

        if (shouldSkipTypeAnnotations) {
          return;
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

        // Builder queries whose terminal call takes no `<T>` infer their row type
        // from the builder's own schema, so there is no annotation/result-type
        // check here. The plugin only resolves these when they embed raw `sql`,
        // which `describe` above has already validated. (A terminal that *does*
        // accept `<T>` falls through to the annotation model below.)
        if (tag.type === "CallExpression" && !calleeAcceptsTypeArgument(tag, checker, parser)) {
          return;
        }

        const isMissingTypeAnnotations = queryTypeParameter === undefined;

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
              nullAsOptional: connection.nullAsOptional ?? false,
              nullAsUndefined: connection.nullAsUndefined ?? false,
              transform: target.transform,
              inferLiterals: connection.inferLiterals ?? defaultInferLiteralOptions,
            }),
            enforceType: connection.enforceType,
          });
        }

        const typeAnnotationState = getTypeAnnotationState({
          generated: result.output,
          typeParameter: queryTypeParameter,
          expectedType: queryExpectedType,
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
            typeParameter: queryTypeParameter,
          });
        }

        if (!typeAnnotationState.isEqual) {
          return reportIncorrectTypeAnnotations({
            context,
            typeParameter: queryTypeParameter,
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
            enforceType: connection.enforceType,
          });
        }
      },
    ),
  );
}

/**
 * Whether the terminal method being called declares its own type parameter
 * (e.g. `execute<T>(): Promise<T>`). If so, the result type is driven by an
 * explicit `<T>` annotation (use the annotation model); if not
 * (`execute(): Promise<O[]>`), the row type is inferred from the receiver.
 */
function calleeAcceptsTypeArgument(
  node: TSESTree.CallExpression,
  checker: ts.TypeChecker,
  parser: ParserServicesWithTypeInformation,
): boolean {
  const tsCall = parser.esTreeNodeToTSNodeMap.get(node);
  if (tsCall === undefined || !ts.isCallExpression(tsCall)) {
    return false;
  }

  return checker
    .getTypeAtLocation(tsCall.expression)
    .getCallSignatures()
    .some((signature) => (signature.getTypeParameters()?.length ?? 0) > 0);
}

function checkConnectionByTagExpression(params: {
  context: RuleContext;
  connection: RuleOptionConnection;
  target: TagTarget;
  tag: TSESTree.TaggedTemplateExpression;
  projectDir: string;
  pluginCtx: PluginContext;
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
      pluginCtx: params.pluginCtx,
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
  pluginCtx: PluginContext;
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
      pluginCtx: params.pluginCtx,
    });
  }
}

type GetTypeAnnotationStateParams = {
  generated: ResolvedTarget | null;
  typeParameter?: TSESTree.TSTypeParameterInstantiation;
  expectedType?: TSESTree.TypeNode | ts.Node;
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
  expectedType,
}: GetTypeAnnotationStateParams) {
  const expected = getExpectedTarget({
    expectedType: expectedType ?? typeParameter?.params.at(0) ?? undefined,
    checker,
    parser,
    reservedTypes,
    forceTypeNode: typeParameter !== undefined,
  });

  if (expected === null) {
    return "INVALID" as const;
  }

  return getResolvedTargetsEquality({
    expected,
    generated,
    nullAsOptional,
    nullAsUndefined,
    inferLiterals,
    transform,
  });
}

function getExpectedTarget({
  expectedType,
  checker,
  parser,
  reservedTypes,
  forceTypeNode = false,
}: {
  expectedType?: TSESTree.TypeNode | ts.Node;
  checker: ts.TypeChecker;
  parser: ParserServices;
  reservedTypes: Set<string>;
  forceTypeNode?: boolean;
}): ExpectedResolvedTarget | null {
  if (expectedType === undefined) {
    return null;
  }

  if (forceTypeNode) {
    if (isTSESTreeTypeNode(expectedType)) {
      return getResolvedTargetByTypeNode({
        checker,
        parser,
        typeNode: expectedType,
        reservedTypes,
      });
    }

    return null;
  }

  const expectedTypeNode = getTsNodeFromExpectedType(expectedType, parser);
  const expectedTypeType = checker.getTypeAtLocation(expectedTypeNode);
  return getResolvedTargetByType({
    checker,
    parser,
    reservedTypes,
    type: expectedTypeType,
    anchorNode: expectedTypeNode,
  });
}

function getTsNodeFromExpectedType(
  expectedType: TSESTree.TypeNode | ts.Node,
  parser: ParserServices,
): ts.Node {
  if (isTypeScriptNode(expectedType)) {
    return expectedType;
  }

  return parser.esTreeNodeToTSNodeMap.get(expectedType);
}

// `kind` is the reliable discriminator: it's unique to TypeScript AST nodes,
// whereas a `ts.Node` can also carry a `type` property.
function isTSESTreeTypeNode(value: TSESTree.TypeNode | ts.Node): value is TSESTree.TypeNode {
  return !("kind" in value);
}

function isTypeScriptNode(value: TSESTree.TypeNode | ts.Node): value is ts.Node {
  return "kind" in value;
}

const createRule = ESLintUtils.RuleCreator(() => `https://github.com/ts-safeql/safeql`)<
  RuleOptions,
  RuleMessage
>;

export default createRule({
  name: "check-sql",
  meta: {
    fixable: "code",
    hasSuggestions: true,
    docs: {
      description: "Ensure that sql queries have type annotations",
    },
    messages: messages,
    type: "problem",
    schema: z.toJSONSchema(RuleOptions, { target: "draft-4" }) as JSONSchema4,
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
      CallExpression(node) {
        if (!isTerminalBuilderCall(node)) {
          return;
        }

        check({ context, tag: node, config, projectDir });
      },
    };
  },
});
