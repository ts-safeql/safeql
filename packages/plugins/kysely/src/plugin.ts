import vm from "node:vm";
import type { TSESTree } from "@typescript-eslint/utils";
import {
  CamelCasePlugin,
  DummyDriver,
  DeduplicateJoinsPlugin,
  HandleEmptyInListsPlugin,
  Kysely,
  ParseJSONResultsPlugin,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  WithSchemaPlugin,
  sql as kyselySql,
} from "kysely";
import {
  ast,
  type QuerySourceMapEntry,
  type ResolveQueryContext,
  definePlugin,
  type TargetContext,
  type TargetMatch,
} from "@ts-safeql/plugin-utils";
import ts from "typescript";
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

const builderCompileTimeoutMs = 1000;

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

// `checker.getBaseTypes` yields only direct bases, so recurse to reach QueryCreator from a
// Transaction/ControlledTransaction or a user subclass of Kysely.
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

const allowedBuilderPlugins = new Set([
  "CamelCasePlugin",
  "ParseJSONResultsPlugin",
  "DeduplicateJoinsPlugin",
  "WithSchemaPlugin",
  "HandleEmptyInListsPlugin",
]);

// `(column, operator, value)` methods whose value slot is purely parameterized when the operator is scalar.
const whereLikeMethods = new Set(["where", "having", "andWhere", "orWhere", "and", "or", "on"]);

// Operators that compile a runtime value to a single bound param, so a free variable there is safe to stub.
// Excludes operators whose value changes the SQL text (`in`, `is`, `any`/`all`/`some`).
const safeValueOperators = new Set([
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

// Property names that introduce SQL we cannot statically reconstruct.
const blockedBuilderMemberNames = new Set(["with", "dynamic", "sql"]);

// Stub for a free variable in a safe value position; its value is irrelevant (Kysely emits `$N`).
const SAFE_VALUE_STUB = "1";

export default definePlugin({
  name: "kysely",
  package: "@ts-safeql/plugin-kysely",
  setup(config: KyselyPluginConfig = {}) {
    const plugin = {
      // No `targets`: `onTarget` is authoritative, validating only kysely `sql` tags.
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
  const chain = tsNode.expression;

  const state: RenderState = { hasEmbeddedSql: false, fragments: [] };
  const compileText = buildBuilderCompileText(chain, context.checker, sourceFile, state);
  if (compileText === undefined) {
    return skipBuilderQuery(
      tsNode,
      sourceFile,
      "dynamic builder shape (a value drives the SQL text)",
    );
  }

  // Builder mode only lints embedded raw `sql`; a pure builder is covered by Kysely's own types.
  if (!state.hasEmbeddedSql) {
    return skipBuilderQuery(tsNode, sourceFile, "no embedded raw sql to validate");
  }

  const resultSql = resolveBuilderQueryInSandbox(compileText);

  if (!resultSql) {
    return skipBuilderQuery(tsNode, sourceFile, "could not compile chain in sandbox");
  }

  builderStats.validated += 1;
  logBuilderDebug(`validated (${builderStats.validated} total): ${truncate(resultSql)}`);

  return {
    kind: "sql",
    text: resultSql,
    sourcemaps: buildBuilderSourcemaps({ state, resultSql, tsNode, sourceFile }),
  };
}

// Map compiled SQL back to the embedded fragment so DB errors squiggle source, not the generated
// offset. One fragment → point at it; several (unattributable) → point at the whole chain.
function buildBuilderSourcemaps(params: {
  state: RenderState;
  resultSql: string;
  tsNode: ts.Node;
  sourceFile: ts.SourceFile;
}): QuerySourceMapEntry[] {
  const { state, resultSql, tsNode, sourceFile } = params;
  const nodeStart = tsNode.getStart(sourceFile);
  const sourceText = sourceFile.text;

  const target =
    state.fragments.length === 1 ? state.fragments[0] : { start: nodeStart, end: tsNode.getEnd() };

  const text = sourceText.slice(target.start, target.end);

  return [
    {
      generated: { start: 0, end: resultSql.length, text: resultSql },
      original: { start: target.start - nodeStart, end: target.end - nodeStart, text },
      offset: 0,
    },
  ];
}

// Non-static queries are skipped silently (dynamic queries are idiomatic);
// set `SAFEQL_DEBUG_KYSELY_BUILDER=1` to log validated/skipped counts and reasons.
const builderStats = { validated: 0, skipped: 0 };

function skipBuilderQuery(node: ts.Node, sourceFile: ts.SourceFile, reason: string): "skip" {
  builderStats.skipped += 1;
  logBuilderDebug(
    `skipped (${builderStats.skipped} total): ${reason} — ${truncate(node.getText(sourceFile))}`,
  );
  return "skip";
}

function logBuilderDebug(message: string): void {
  if (process.env.SAFEQL_DEBUG_KYSELY_BUILDER) {
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

  // Fragments (nested templates, `.as()`, builder-method args) aren't standalone queries.
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

function isTerminalBuilderCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }

  return terminalBuilderMethods.has(node.expression.name.text);
}

function resolveBuilderQueryInSandbox(chain: string): string | undefined {
  const database = buildBuilderDatabaseExpression();
  const source = `
    const __safeqlDb = ${database};
    const __safeqlCompiled = ${chain};
    if (!__safeqlCompiled || typeof __safeqlCompiled.sql !== "string") {
      throw new Error("kysely-builder-not-a-compilation-result");
    }
    __safeqlResultSql = __safeqlCompiled.sql;
  `;

  const context = createBuilderContext();
  try {
    vm.createContext(context);
    const script = new vm.Script(source, { filename: "safeql-kysely-builder.js" });
    script.runInContext(context, { timeout: builderCompileTimeoutMs });
  } catch {
    return undefined;
  }

  const value = context.__safeqlResultSql;
  return typeof value === "string" ? value : undefined;
}

// Scope-limiting globals (not a security boundary — `vm` can be escaped): only these Kysely
// building blocks are in scope, so any other free reference throws (→ skip) rather than
// silently corrupting the compiled SQL.
function createBuilderContext(): Record<string, unknown> {
  return {
    CamelCasePlugin,
    ParseJSONResultsPlugin,
    DeduplicateJoinsPlugin,
    WithSchemaPlugin,
    HandleEmptyInListsPlugin,
    Kysely,
    DummyDriver,
    PostgresAdapter,
    PostgresIntrospector,
    PostgresQueryCompiler,
    sql: kyselySql,
    __safeqlResultSql: undefined,
  };
}

interface RenderState {
  hasEmbeddedSql: boolean;
  fragments: Array<{ start: number; end: number }>;
}

function buildBuilderCompileText(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  state: RenderState,
): string | undefined {
  if (!ts.isPropertyAccessExpression(expression)) {
    return undefined;
  }

  const chainText = renderBuilderChain(expression.expression, checker, sourceFile, state);
  if (chainText === undefined) {
    return undefined;
  }

  return `${chainText}.compile()`;
}

function renderBuilderChain(
  node: ts.Expression,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  state: RenderState,
): string | undefined {
  const unwrapped = ast.unwrap({ node: node });

  // The CallExpression guard keeps `db.withSchema(...)` — also `Kysely<DB>`-typed — in the chain
  // rather than treating it as the root.
  if (!ts.isCallExpression(unwrapped) && isKyselyBuilderRoot(unwrapped, checker)) {
    return "__safeqlDb";
  }

  // A statically-constructed Kysely plugin, e.g. `.withPlugin(new CamelCasePlugin())`.
  if (ts.isNewExpression(unwrapped)) {
    return renderPluginConstruction(unwrapped, checker, sourceFile);
  }

  if (ts.isPropertyAccessExpression(unwrapped)) {
    if (blockedBuilderMemberNames.has(unwrapped.name.text)) {
      return undefined;
    }

    const receiverText = renderBuilderChain(unwrapped.expression, checker, sourceFile, state);
    if (receiverText === undefined) {
      return undefined;
    }

    return `${receiverText}.${unwrapped.name.text}`;
  }

  if (ts.isCallExpression(unwrapped)) {
    const calleeText = renderBuilderChain(unwrapped.expression, checker, sourceFile, state);
    if (calleeText === undefined) {
      return undefined;
    }

    const argsText = renderCallArguments(unwrapped, checker, sourceFile, state);
    if (argsText === undefined) {
      return undefined;
    }

    return `${calleeText}(${argsText})`;
  }

  // Anything else here is a free variable in a structural position → not reconstructible.
  return undefined;
}

function renderPluginConstruction(
  node: ts.NewExpression,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
): string | undefined {
  if (!ts.isIdentifier(node.expression) || !allowedBuilderPlugins.has(node.expression.text)) {
    return undefined;
  }

  const args = node.arguments ?? [];
  const rendered: string[] = [];
  for (const arg of args) {
    const value = ast.getStaticValue({ node: arg, checker: checker });
    if (value === ast.UNRESOLVED) {
      return undefined;
    }
    rendered.push(staticValueToSource(value));
  }

  return `new ${node.expression.text}(${rendered.join(", ")})`;
}

// Only the value slot of a scalar where-like call may be a free variable (→ bound param); other args must be static.
function renderCallArguments(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  state: RenderState,
): string | undefined {
  const methodName = ts.isPropertyAccessExpression(call.expression)
    ? call.expression.name.text
    : undefined;
  const args = call.arguments;

  if (
    methodName !== undefined &&
    whereLikeMethods.has(methodName) &&
    args.length === 3 &&
    !isKyselySqlExpression(args[0], checker)
  ) {
    const column = ast.getStaticValue({ node: args[0], checker: checker });
    const operator = ast.getStaticValue({ node: args[1], checker: checker });
    if (typeof column !== "string" || typeof operator !== "string") {
      // Dynamic column/operator drives SQL structure → skip.
      return undefined;
    }

    const value = ast.getStaticValue({ node: args[2], checker: checker });
    let valueText: string;
    if (value !== ast.UNRESOLVED) {
      valueText = staticValueToSource(value);
    } else if (safeValueOperators.has(operator)) {
      valueText = SAFE_VALUE_STUB;
    } else {
      return undefined;
    }

    return [staticValueToSource(column), staticValueToSource(operator), valueText].join(", ");
  }

  const rendered: string[] = [];
  for (const arg of args) {
    const argText = renderArgumentValue(arg, checker, sourceFile, state);
    if (argText === undefined) {
      return undefined;
    }
    rendered.push(argText);
  }

  return rendered.join(", ");
}

/**
 * Render a single argument value: a static literal, an array of them, an
 * allowed plugin construction, or an embedded `sql` fragment (possibly with a
 * `.as(...)`/method chain). Anything else (callbacks, free variables in a
 * structural position) → `undefined` (skip).
 */
function renderArgumentValue(
  arg: ts.Expression,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  state: RenderState,
): string | undefined {
  const unwrapped = ast.unwrap({ node: arg });

  if (ts.isFunctionLike(unwrapped) || ts.isSpreadElement(unwrapped)) {
    return undefined;
  }

  if (containsKyselySqlFragment(unwrapped, checker)) {
    return renderSqlExpressionChain(unwrapped, checker, sourceFile, state);
  }

  if (ts.isArrayLiteralExpression(unwrapped)) {
    const elements: string[] = [];
    for (const element of unwrapped.elements) {
      if (ts.isSpreadElement(element)) {
        return undefined;
      }
      const rendered = renderArgumentValue(element, checker, sourceFile, state);
      if (rendered === undefined) {
        return undefined;
      }
      elements.push(rendered);
    }
    return `[${elements.join(", ")}]`;
  }

  if (ts.isNewExpression(unwrapped)) {
    return renderPluginConstruction(unwrapped, checker, sourceFile);
  }

  const value = ast.getStaticValue({ node: unwrapped, checker: checker });
  if (value === ast.UNRESOLVED) {
    return undefined;
  }

  return staticValueToSource(value);
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

function renderSqlExpressionChain(
  node: ts.Node,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  state: RenderState,
): string | undefined {
  const u = ast.unwrap({ node: node });

  if (isKyselySqlTaggedTemplate(u, checker)) {
    state.hasEmbeddedSql = true;
    state.fragments.push({ start: u.getStart(sourceFile), end: u.getEnd() });
    return renderEmbeddedSqlFragment(u.template, checker, sourceFile);
  }

  if (ts.isCallExpression(u)) {
    const callee = renderSqlExpressionChain(u.expression, checker, sourceFile, state);
    if (callee === undefined) return undefined;

    const args: string[] = [];
    for (const arg of u.arguments) {
      const rendered = renderArgumentValue(arg, checker, sourceFile, state);
      if (rendered === undefined) return undefined;
      args.push(rendered);
    }
    return `${callee}(${args.join(", ")})`;
  }

  if (ts.isPropertyAccessExpression(u)) {
    const receiver = renderSqlExpressionChain(u.expression, checker, sourceFile, state);
    if (receiver === undefined) return undefined;
    return `${receiver}.${u.name.text}`;
  }

  return undefined;
}

function renderEmbeddedSqlFragment(
  template: ts.TemplateLiteral,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
): string {
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return `sql\`${escapeTemplateText(template.text)}\``;
  }

  let out = `sql\`${escapeTemplateText(template.head.text)}`;
  for (const span of template.templateSpans) {
    out += `\${${renderInterpolation(span.expression, checker, sourceFile)}}`;
    out += escapeTemplateText(span.literal.text);
  }
  return `${out}\``;
}

function renderInterpolation(
  expr: ts.Expression,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
): string {
  const u = ast.unwrap({ node: expr });

  // A kysely helper or nested `sql` fragment is evaluated as-is (dynamic arg throws → skip); anything else → value stub.
  if (
    isKyselySqlTaggedTemplate(u, checker) ||
    (ts.isCallExpression(u) && isKyselyHelperCall(u, checker))
  ) {
    return u.getText(sourceFile);
  }

  return SAFE_VALUE_STUB;
}

function escapeTemplateText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

function staticValueToSource(value: ast.StaticValue): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(staticValueToSource).join(", ")}]`;
  }
  return String(value);
}

function buildBuilderDatabaseExpression(): string {
  // No plugins on the base DB; identifier-rewriting plugins are applied inline via `.withPlugin(...)` in the chain.
  return `new Kysely({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [],
  })`;
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
      // Bare placeholder (no cast); let Postgres infer the type.
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

  // Only a literal `sql`...`` separator is resolved; a variable separator skips the query rather than guessing.
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

function isFragmentUsage(tsNode: ts.TaggedTemplateExpression): boolean {
  if (tsNode.parent && ts.isTemplateSpan(tsNode.parent)) {
    return true;
  }

  let current: ts.Node = tsNode;
  let parent = current.parent;

  while (parent) {
    if (ts.isPropertyAccessExpression(parent) && parent.expression === current) {
      // `.as(...)` marks a selection fragment, never a standalone query.
      if (["as", "toOperationNode"].includes(parent.name.text)) return true;
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

  // Passed as a call argument (e.g. `.where(sql`...`)`) → fragment.
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

function isKyselyHelperCall(call: ts.CallExpression, checker: ts.TypeChecker): boolean {
  return ts.isPropertyAccessExpression(call.expression) && isKyselyTag(call.expression, checker);
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
