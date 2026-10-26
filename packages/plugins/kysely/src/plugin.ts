import type { TSESTree } from "@typescript-eslint/utils";
import {
  ast,
  type QuerySourceMapEntry,
  type ResolveQueryContext,
  definePlugin,
  type TargetContext,
  type TargetMatch,
} from "@ts-safeql/plugin-utils";
import ts from "typescript";
import {
  callMethod,
  callSqlHelper,
  callSqlTag,
  constructPlugin,
  createCompilerDatabase,
  getCompiledSql,
  readMember,
} from "./builder-runtime";
import { createBuilderTypeCheck, type TypedBuilderFragment } from "./builder-type-check";
import { migrate } from "./migrate";

type KyselyPluginConfig = {
  builder?: boolean;
};

const terminalBuilderMethods = new Set([
  "execute",
  "executeTakeFirst",
  "executeTakeFirstOrThrow",
  "compile",
  "stream",
]);

const kyselyBuilderTypeNames = new Set([
  "QueryCreator",
  "Kysely",
  "Transaction",
  "ControlledTransaction",
]);

function isKyselyBuilderRoot(node: ts.Node, checker: ts.TypeChecker): boolean {
  if (
    !ts.isIdentifier(node) &&
    !ts.isPropertyAccessExpression(node) &&
    !ts.isElementAccessExpression(node) &&
    node.kind !== ts.SyntaxKind.ThisKeyword
  ) {
    return false;
  }

  return typeDerivesFromKyselyBuilder(
    checker.getApparentType(checker.getTypeAtLocation(node)),
    checker,
  );
}

function typeDerivesFromKyselyBuilder(type: ts.Type, checker: ts.TypeChecker): boolean {
  const seen = new Set<ts.Type>();
  const visit = (current: ts.Type): boolean => {
    if (seen.has(current)) return false;
    seen.add(current);

    if (current.isUnionOrIntersection()) {
      return current.types.some(visit);
    }

    if (symbolIsKyselyBuilder(current.getSymbol() ?? current.aliasSymbol, checker)) {
      return true;
    }

    const bases = current.isClassOrInterface() ? checker.getBaseTypes(current) : [];
    return bases.some(visit);
  };

  return visit(type);
}

function symbolIsKyselyBuilder(symbol: ts.Symbol | undefined, checker: ts.TypeChecker): boolean {
  if (symbol === undefined || !kyselyBuilderTypeNames.has(symbol.getName())) {
    return false;
  }

  return ast.isSymbolImportedFrom({ checker, symbol, moduleName: "kysely" });
}

const whereLikeMethods = new Set(["where", "having", "andWhere", "orWhere", "and", "or", "on"]);

const singleBoundParamOperators = new Set([
  "=",
  "==",
  "!=",
  "<>",
  "<",
  "<=",
  ">",
  ">=",
  "like",
  "not like",
  "ilike",
  "not ilike",
  "~",
  "~*",
  "!~",
  "!~*",
  "@>",
  "<@",
]);

const BOUND_PARAM_STUB = 1;

const fragmentMarkerMethods = new Set(["as", "toOperationNode"]);

const DEBUG_BUILDER_ENV_VAR = "SAFEQL_DEBUG_KYSELY_BUILDER";

export default definePlugin({
  name: "kysely",
  package: "@ts-safeql/plugin-kysely",
  setup(config: KyselyPluginConfig = {}) {
    const plugin = {
      onTarget,
      onExpression,
      migrate,
    } as const;

    if (config.builder === true) {
      return {
        ...plugin,
        queryNodeKinds: [
          { kind: "CallExpression", callee: { property: { nameIn: [...terminalBuilderMethods] } } },
        ],
        resolveQuery: (context) => resolveBuilderQuery(context),
      };
    }

    return plugin;
  },
});

function resolveBuilderQuery(
  context: ResolveQueryContext,
): { kind: "sql"; text: string; sourcemaps: QuerySourceMapEntry[] } | "skip" {
  const tsNode = context.tsNode;
  if (!ts.isCallExpression(tsNode) || !isTerminalBuilderCall(tsNode)) {
    return "skip";
  }

  const sourceFile = tsNode.getSourceFile();
  const state: EvaluationState = { hasEmbeddedSql: false, fragments: [], typedFragments: [] };
  const builder = evaluateBuilderChain(
    tsNode.expression.expression,
    context.checker,
    sourceFile,
    state,
  );
  if (builder === ast.UNRESOLVED) {
    return skipBuilderQuery(
      tsNode,
      sourceFile,
      "dynamic builder shape (a value drives the SQL text)",
    );
  }

  if (!state.hasEmbeddedSql) {
    return skipBuilderQuery(tsNode, sourceFile, "no embedded raw sql to validate");
  }

  const resultSql = getCompiledSql(callMethod(builder, "compile", []));
  if (!resultSql) {
    return skipBuilderQuery(tsNode, sourceFile, "kysely could not compile the chain");
  }

  builderStats.validated += 1;
  logBuilderDebug(`validated (${builderStats.validated} total): ${truncate(resultSql)}`);

  return {
    kind: "sql",
    text: resultSql,
    sourcemaps: buildBuilderSourcemaps({ state, resultSql, tsNode, sourceFile }),
    ...(state.typedFragments.length > 0
      ? { typeCheck: createBuilderTypeCheck(state.typedFragments) }
      : {}),
  };
}

function buildBuilderSourcemaps(params: {
  state: EvaluationState;
  resultSql: string;
  tsNode: ts.Node;
  sourceFile: ts.SourceFile;
}): QuerySourceMapEntry[] {
  const { state, resultSql, tsNode, sourceFile } = params;
  const nodeStart = tsNode.getStart(sourceFile);
  const sourceText = sourceFile.text;

  const wholeChain = { start: nodeStart, end: tsNode.getEnd() };
  const target = state.fragments.length === 1 ? state.fragments[0] : wholeChain;

  const text = sourceText.slice(target.start, target.end);

  return [
    {
      generated: { start: 0, end: resultSql.length, text: resultSql },
      original: { start: target.start - nodeStart, end: target.end - nodeStart, text },
      offset: 0,
    },
  ];
}

const builderStats = { validated: 0, skipped: 0 };

function skipBuilderQuery(node: ts.Node, sourceFile: ts.SourceFile, reason: string): "skip" {
  builderStats.skipped += 1;
  logBuilderDebug(
    `skipped (${builderStats.skipped} total): ${reason} — ${truncate(node.getText(sourceFile))}`,
  );
  return "skip";
}

function logBuilderDebug(message: string): void {
  if (process.env[DEBUG_BUILDER_ENV_VAR]) {
    // eslint-disable-next-line no-console
    console.error(`[safeql:kysely:builder] ${message}`);
  }
}

function truncate(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function onTarget({
  node,
  context,
}: {
  node: TSESTree.TaggedTemplateExpression;
  context: TargetContext;
}): TargetMatch | false | undefined {
  const tsNode = context.parser.esTreeNodeToTSNodeMap.get(node);

  if (!tsNode || !ts.isTaggedTemplateExpression(tsNode)) {
    return undefined;
  }

  if (!isKyselyTag(tsNode.tag, context.checker)) {
    return undefined;
  }

  if (isFragmentUsage(tsNode)) {
    return false;
  }

  return {};
}

function onExpression({
  context,
}: {
  node: TSESTree.Expression;
  context: { checker: ts.TypeChecker; precedingSQL: string; tsNode: ts.Node };
}): string | false | undefined {
  return buildExpressionSQL(context.tsNode, context.checker);
}

function isTerminalBuilderCall(
  node: ts.CallExpression,
): node is ts.CallExpression & { expression: ts.PropertyAccessExpression } {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }

  return terminalBuilderMethods.has(node.expression.name.text);
}

interface EvaluationState {
  hasEmbeddedSql: boolean;
  fragments: Array<{ start: number; end: number }>;
  typedFragments: TypedBuilderFragment[];
}

type KyselyHelperCall = ts.CallExpression & { expression: ts.PropertyAccessExpression };

type MethodCall = { receiver: ts.Expression; name: string; call: ts.CallExpression };

function asMethodCall(node: ts.Node): MethodCall | undefined {
  if (!ts.isCallExpression(node)) {
    return undefined;
  }

  const callee = ast.unwrap({ node: node.expression });
  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }

  return { receiver: callee.expression, name: callee.name.text, call: node };
}

function evaluateBuilderChain(
  node: ts.Expression,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  state: EvaluationState,
): unknown {
  const unwrapped = ast.unwrap({ node: node });

  if (!ts.isCallExpression(unwrapped) && isKyselyBuilderRoot(unwrapped, checker)) {
    return createCompilerDatabase();
  }

  if (ts.isNewExpression(unwrapped)) {
    return evaluatePluginConstruction(unwrapped, checker);
  }

  if (ts.isPropertyAccessExpression(unwrapped)) {
    const receiver = evaluateBuilderChain(unwrapped.expression, checker, sourceFile, state);
    return receiver === ast.UNRESOLVED ? receiver : readMember(receiver, unwrapped.name.text);
  }

  const methodCall = asMethodCall(unwrapped);
  if (methodCall === undefined) {
    return ast.UNRESOLVED;
  }

  const receiver = evaluateBuilderChain(methodCall.receiver, checker, sourceFile, state);
  if (receiver === ast.UNRESOLVED) {
    return receiver;
  }

  const args = evaluateCallArguments(methodCall.call, checker, sourceFile, state);
  return args === ast.UNRESOLVED ? args : callMethod(receiver, methodCall.name, args);
}

function evaluatePluginConstruction(node: ts.NewExpression, checker: ts.TypeChecker): unknown {
  if (!ts.isIdentifier(node.expression)) {
    return ast.UNRESOLVED;
  }

  const args = evaluateEach(node.arguments ?? [], (arg) =>
    ast.getStaticValue({ node: arg, checker: checker }),
  );
  return args === ast.UNRESOLVED ? args : constructPlugin(node.expression.text, args);
}

function evaluateCallArguments(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  state: EvaluationState,
): unknown[] | typeof ast.UNRESOLVED {
  if (isWhereLikeComparison(call, checker)) {
    return evaluateWhereLikeComparisonArguments(call.arguments, checker);
  }

  return evaluateEach(call.arguments, (arg) =>
    evaluateArgumentValue(arg, checker, sourceFile, state),
  );
}

function evaluateEach(
  nodes: readonly ts.Expression[],
  evaluate: (node: ts.Expression) => unknown,
): unknown[] | typeof ast.UNRESOLVED {
  const values: unknown[] = [];
  for (const node of nodes) {
    const value = ts.isSpreadElement(node) ? ast.UNRESOLVED : evaluate(node);
    if (value === ast.UNRESOLVED) {
      return ast.UNRESOLVED;
    }
    values.push(value);
  }
  return values;
}

function isWhereLikeComparison(call: ts.CallExpression, checker: ts.TypeChecker): boolean {
  const methodName = getMethodName(call);
  return (
    methodName !== undefined &&
    whereLikeMethods.has(methodName) &&
    call.arguments.length === 3 &&
    !isKyselySqlExpression(call.arguments[0], checker)
  );
}

function evaluateWhereLikeComparisonArguments(
  args: ts.NodeArray<ts.Expression>,
  checker: ts.TypeChecker,
): unknown[] | typeof ast.UNRESOLVED {
  const [columnArg, operatorArg, valueArg] = args;
  const column = ast.getStaticValue({ node: columnArg, checker: checker });
  const operator = ast.getStaticValue({ node: operatorArg, checker: checker });
  if (typeof column !== "string" || typeof operator !== "string") {
    return ast.UNRESOLVED;
  }

  const value = evaluateComparisonValue(valueArg, operator, checker);
  return value === ast.UNRESOLVED ? value : [column, operator, value];
}

function evaluateComparisonValue(
  valueArg: ts.Expression,
  operator: string,
  checker: ts.TypeChecker,
): unknown {
  const value = ast.getStaticValue({ node: valueArg, checker: checker });
  if (value !== ast.UNRESOLVED) {
    return value;
  }

  return singleBoundParamOperators.has(operator) ? BOUND_PARAM_STUB : ast.UNRESOLVED;
}

function evaluateArgumentValue(
  arg: ts.Expression,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  state: EvaluationState,
): unknown {
  const unwrapped = ast.unwrap({ node: arg });

  if (ts.isFunctionLike(unwrapped) || ts.isSpreadElement(unwrapped)) {
    return ast.UNRESOLVED;
  }

  if (containsKyselySqlFragment(unwrapped, checker)) {
    return evaluateSqlExpressionChain(unwrapped, checker, sourceFile, state);
  }

  if (ts.isArrayLiteralExpression(unwrapped)) {
    return evaluateEach(unwrapped.elements, (element) =>
      evaluateArgumentValue(element, checker, sourceFile, state),
    );
  }

  if (ts.isNewExpression(unwrapped)) {
    return evaluatePluginConstruction(unwrapped, checker);
  }

  return ast.getStaticValue({ node: unwrapped, checker: checker });
}

function isKyselySqlExpression(node: ts.Node, checker: ts.TypeChecker): boolean {
  return containsKyselySqlFragment(ast.unwrap({ node: node }), checker);
}

function containsKyselySqlFragment(node: ts.Node, checker: ts.TypeChecker): boolean {
  const u = ast.unwrap({ node: node });
  if (isKyselySqlTaggedTemplate(u, checker)) return true;
  if (ts.isCallExpression(u)) return containsKyselySqlFragment(u.expression, checker);
  if (ts.isPropertyAccessExpression(u)) return containsKyselySqlFragment(u.expression, checker);
  return false;
}

function isKyselySqlTaggedTemplate(
  node: ts.Node,
  checker: ts.TypeChecker,
): node is ts.TaggedTemplateExpression {
  return ts.isTaggedTemplateExpression(node) && isKyselyTag(node.tag, checker);
}

function evaluateSqlExpressionChain(
  node: ts.Node,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  state: EvaluationState,
): unknown {
  const u = ast.unwrap({ node: node });

  if (isKyselySqlTaggedTemplate(u, checker)) {
    state.hasEmbeddedSql = true;
    state.fragments.push({ start: u.getStart(sourceFile), end: u.getEnd() });

    const typedFragment = classifyTypedFragment(u, checker);
    if (typedFragment !== undefined) {
      state.typedFragments.push(typedFragment);
    }

    return evaluateEmbeddedSqlFragment(u.template, checker);
  }

  if (ts.isPropertyAccessExpression(u)) {
    const receiver = evaluateSqlExpressionChain(u.expression, checker, sourceFile, state);
    return receiver === ast.UNRESOLVED ? receiver : readMember(receiver, u.name.text);
  }

  const methodCall = asMethodCall(u);
  if (methodCall === undefined) {
    return ast.UNRESOLVED;
  }

  const receiver = evaluateSqlExpressionChain(methodCall.receiver, checker, sourceFile, state);
  if (receiver === ast.UNRESOLVED) {
    return receiver;
  }

  const args = evaluateEach(methodCall.call.arguments, (arg) =>
    evaluateArgumentValue(arg, checker, sourceFile, state),
  );
  return args === ast.UNRESOLVED ? args : callMethod(receiver, methodCall.name, args);
}

function evaluateEmbeddedSqlFragment(
  template: ts.TemplateLiteral,
  checker: ts.TypeChecker,
): unknown {
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return callSqlTag([template.text], []);
  }

  const spans = template.templateSpans;
  const values = evaluateEach(
    spans.map((span) => span.expression),
    (expression) => evaluateInterpolation(expression, checker),
  );
  if (values === ast.UNRESOLVED) {
    return values;
  }

  return callSqlTag([template.head.text, ...spans.map((span) => span.literal.text)], values);
}

function evaluateInterpolation(expression: ts.Expression, checker: ts.TypeChecker): unknown {
  const u = ast.unwrap({ node: expression });

  if (isKyselySqlTaggedTemplate(u, checker)) {
    return evaluateEmbeddedSqlFragment(u.template, checker);
  }

  if (isKyselyHelperCall(u, checker)) {
    return evaluateSqlHelperCall(u, checker);
  }

  return BOUND_PARAM_STUB;
}

function evaluateSqlHelperCall(call: KyselyHelperCall, checker: ts.TypeChecker): unknown {
  const args = evaluateEach(call.arguments, (arg) => evaluateSqlHelperArgument(arg, checker));
  return args === ast.UNRESOLVED ? args : callSqlHelper(call.expression.name.text, args);
}

function evaluateSqlHelperArgument(arg: ts.Expression, checker: ts.TypeChecker): unknown {
  const u = ast.unwrap({ node: arg });

  if (isKyselySqlTaggedTemplate(u, checker)) {
    return evaluateEmbeddedSqlFragment(u.template, checker);
  }

  if (isKyselyHelperCall(u, checker)) {
    return evaluateSqlHelperCall(u, checker);
  }

  if (ts.isArrayLiteralExpression(u)) {
    return evaluateEach(u.elements, (element) => evaluateSqlHelperArgument(element, checker));
  }

  return ast.getStaticValue({ node: u, checker: checker });
}

function buildExpressionSQL(node: ts.Node, checker: ts.TypeChecker): string | false | undefined {
  const expression = ast.unwrap({ node: node });

  if (ts.isTaggedTemplateExpression(expression) && isKyselyTag(expression.tag, checker)) {
    return buildTemplateSQL(expression.template, checker);
  }

  if (ts.isIdentifier(expression)) {
    const initializer = ast.findInitializer({ identifier: expression, checker: checker });
    return initializer ? buildExpressionSQL(initializer, checker) : undefined;
  }

  if (!ts.isCallExpression(expression) || !isKyselyHelperCall(expression, checker)) {
    return undefined;
  }

  return buildHelperSQL(expression, checker);
}

function buildHelperSQL(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
): string | false | undefined {
  const method = getMethodName(call);
  const args = call.arguments;

  switch (method) {
    case "val":
    case "value":
      return "$N";

    case "ref":
    case "table": {
      const value = ast.getStaticValue({ node: args[0], checker: checker });
      return typeof value === "string" ? quoteIdentifierPath(value) : false;
    }

    case "id": {
      const parts: string[] = [];
      for (const arg of args) {
        const value = ast.getStaticValue({ node: arg, checker: checker });
        if (typeof value !== "string") return false;
        parts.push(value);
      }
      return parts.length > 0 ? parts.map(quoteIdentifier).join(".") : false;
    }

    case "lit":
    case "literal": {
      const value = ast.getStaticValue({ node: args[0], checker: checker });
      return formatLiteral(value);
    }

    case "raw": {
      const value = ast.getStaticValue({ node: args[0], checker: checker });
      return typeof value === "string" ? value : false;
    }

    case "join":
      return buildJoinSQL(call, checker);

    default:
      return undefined;
  }
}

function buildJoinSQL(call: ts.CallExpression, checker: ts.TypeChecker): string | false {
  const values = ast.getStaticValue({ node: call.arguments[0], checker: checker });
  if (!Array.isArray(values)) return false;

  const separator = getJoinSeparator(call.arguments[1], checker);
  if (separator === false) return false;

  return values.map(() => "$N").join(separator);
}

function getJoinSeparator(arg: ts.Expression | undefined, checker: ts.TypeChecker): string | false {
  if (arg === undefined) return ", ";

  const expression = ast.unwrap({ node: arg });
  if (ts.isTaggedTemplateExpression(expression) && isKyselyTag(expression.tag, checker)) {
    const text = buildTemplateSQL(expression.template, checker);
    return typeof text === "string" ? text : false;
  }

  return false;
}

function buildTemplateSQL(
  template: ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression,
  checker: ts.TypeChecker,
): string | false {
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return template.text;
  }

  let sql = template.head.text;

  for (const span of template.templateSpans) {
    const resolved = buildExpressionSQL(span.expression, checker);
    if (resolved === false) return false;
    sql += typeof resolved === "string" ? resolved : "$N";
    sql += span.literal.text;
  }

  return sql;
}

function classifyTypedFragment(
  node: ts.TaggedTemplateExpression,
  checker: ts.TypeChecker,
): TypedBuilderFragment | undefined {
  if (node.typeArguments === undefined || node.typeArguments.length === 0) {
    return undefined;
  }

  const alias = getSelectionAlias(node, checker);
  if (alias !== undefined) {
    return { kind: "column", alias, tag: node };
  }

  if (isConditionFragment(node)) {
    return { kind: "condition", tag: node };
  }

  return undefined;
}

function climbTransparentWrappers(node: ts.Node): ts.Node {
  let current = node;
  while (
    current.parent &&
    (ts.isParenthesizedExpression(current.parent) ||
      ts.isAsExpression(current.parent) ||
      ts.isNonNullExpression(current.parent)) &&
    current.parent.expression === current
  ) {
    current = current.parent;
  }
  return current;
}

function isConditionFragment(node: ts.TaggedTemplateExpression): boolean {
  let current = climbTransparentWrappers(node);
  let parent = current.parent;

  while (parent && ts.isPropertyAccessExpression(parent) && parent.expression === current) {
    current = parent;
    parent = parent.parent;
  }

  if (!parent || !ts.isCallExpression(parent)) {
    return false;
  }

  const isSoleArgument =
    parent.arguments.length === 1 &&
    (parent.arguments[0] === current || ast.unwrap({ node: parent.arguments[0] }) === node);
  if (!isSoleArgument) {
    return false;
  }

  const callee = parent.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return false;
  }

  return whereLikeMethods.has(callee.name.text);
}

function getSelectionAlias(
  node: ts.TaggedTemplateExpression,
  checker: ts.TypeChecker,
): string | undefined {
  const fragment = climbTransparentWrappers(node);
  const asAccess = fragment.parent;
  if (
    !asAccess ||
    !ts.isPropertyAccessExpression(asAccess) ||
    asAccess.expression !== fragment ||
    asAccess.name.text !== "as"
  ) {
    return undefined;
  }

  const asCall = asAccess.parent;
  if (!asCall || !ts.isCallExpression(asCall) || asCall.expression !== asAccess) {
    return undefined;
  }

  const aliasArg = asCall.arguments[0];
  if (aliasArg === undefined) {
    return undefined;
  }

  const alias = ast.getStaticValue({ node: aliasArg, checker: checker });
  return typeof alias === "string" ? alias : undefined;
}

function isFragmentUsage(tsNode: ts.TaggedTemplateExpression): boolean {
  if (tsNode.parent && ts.isTemplateSpan(tsNode.parent)) {
    return true;
  }

  let current: ts.Node = tsNode;
  let parent = current.parent;

  while (parent) {
    if (ts.isPropertyAccessExpression(parent) && parent.expression === current) {
      if (fragmentMarkerMethods.has(parent.name.text)) return true;
      current = parent;
      parent = current.parent;
      continue;
    }

    if (
      (ts.isCallExpression(parent) ||
        ts.isAwaitExpression(parent) ||
        ts.isParenthesizedExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isNonNullExpression(parent)) &&
      getInnerExpression(parent) === current
    ) {
      current = parent;
      parent = current.parent;
      continue;
    }

    break;
  }

  return (
    parent !== undefined &&
    ts.isCallExpression(parent) &&
    parent.arguments.some((arg) => arg === current)
  );
}

function getInnerExpression(node: ts.Node): ts.Node | undefined {
  if (ts.isCallExpression(node)) return node.expression;
  if (
    ts.isAwaitExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return node.expression;
  }
  return undefined;
}

function isKyselyTag(node: ts.Node, checker: ts.TypeChecker): boolean {
  return ast.isImportedFrom({ node: node, checker: checker, moduleName: "kysely" });
}

function isKyselyHelperCall(node: ts.Node, checker: ts.TypeChecker): node is KyselyHelperCall {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    isKyselyTag(node.expression, checker)
  );
}

function getMethodName(call: ts.CallExpression): string | undefined {
  return ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : undefined;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteIdentifierPath(value: string): string {
  return value.split(".").map(quoteIdentifier).join(".");
}

function formatLiteral(value: ast.StaticValue | typeof ast.UNRESOLVED): string | false {
  if (value === ast.UNRESOLVED) return false;
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (value === null) return "null";
  return false;
}
