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
  type ResolvedSchemaColumn,
  type ResolvedSchemaTable,
  type ResolvedSchemaType,
  type SchemaTypeContext,
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

const allowedBuilderRoots = new Set(["db", "trx"]);
const allowedBuilderPlugins = new Set([
  "CamelCasePlugin",
  "ParseJSONResultsPlugin",
  "DeduplicateJoinsPlugin",
  "WithSchemaPlugin",
  "HandleEmptyInListsPlugin",
]);

// Methods whose `(column, operator, value)` form puts a runtime value in a
// purely parameterized slot — when (and only when) the operator is one of the
// scalar operators below, where the SQL text is independent of the value.
const whereLikeMethods = new Set(["where", "having", "andWhere", "orWhere", "and", "or", "on"]);

// Operators that compile a runtime value to a single bound parameter (`$N`),
// so a free variable there is safe to stub. Deliberately excludes operators
// whose value changes the SQL *text*: `in`/`not in` (list arity),
// `is`/`is not` (literal inlining), `any`/`all`/`some` (array expansion).
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

// Stub rendered for a free variable sitting in a safe (parameterized) value
// position. Its concrete value is irrelevant — Kysely emits a `$N` placeholder.
const SAFE_VALUE_STUB = "1";

export default definePlugin({
  name: "kysely",
  package: "@ts-safeql/plugin-kysely",
  setup(config: KyselyPluginConfig = {}) {
    const plugin = {
      // No `connectionDefaults.targets`: `onTarget` is authoritative. A kysely
      // `sql` tag is validated only when `onTarget` returns a TargetMatch; every
      // other tag (fragments, non-kysely tags) is skipped.
      onTarget,
      onExpression,
      // Run the project's Kysely TS migrations against the shadow database.
      migrate,
      // Interpret the Kysely `Database` interface for `check-schema` drift validation.
      resolveSchemaType,
    } as const;

    if (config.builder === true) {
      return {
        ...plugin,
        queryNodeKinds: ["CallExpression"],
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

  const root = getBuilderRootExpression(chain);
  if (!isSupportedBuilderRoot(root)) {
    return skipBuilderQuery(tsNode, sourceFile, "unsupported builder root");
  }

  const state: RenderState = { hasEmbeddedSql: false, fragments: [] };
  const compileText = buildBuilderCompileText(chain, context.checker, sourceFile, state);
  if (compileText === undefined) {
    return skipBuilderQuery(
      tsNode,
      sourceFile,
      "dynamic builder shape (a value drives the SQL text)",
    );
  }

  // Builder mode exists to lint the *raw sql* embedded in a chain. A pure
  // builder (no `sql` fragment) is fully covered by Kysely's own types, so we
  // leave it to them rather than re-validating it here.
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

/**
 * Map the compiled SQL back to the chain's embedded `sql` fragment(s), so a
 * database error squiggles the fragment in source rather than a meaningless
 * offset in the generated SQL. With a single fragment we point at it; with
 * several (the position can't be attributed) we point at the whole chain.
 */
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

// Builder validation deliberately skips any query whose SQL text is not fully
// determined statically. Skips are *silent by default* (dynamic queries are
// idiomatic and a warning per query would be noise); set
// `SAFEQL_DEBUG_KYSELY_BUILDER=1` to log validated/skipped counts and reasons.
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

  // Fragments (nested templates, `.as()` selections, builder-method arguments)
  // are not standalone queries and must not be validated.
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

// A strict sandbox global: only the Kysely building blocks we explicitly expose
// exist. Any other free reference throws a ReferenceError, which we treat as a
// skip. This guarantees no free variable can silently corrupt the compiled SQL
// (the classifier in `renderBuilderChain` should have already stubbed or
// rejected every runtime value — this is the backstop).
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
    // The `sql` tag so embedded raw-sql fragments (`.select(sql`...`.as())`,
    // `.where(sql`...`)`) compile as part of the chain.
    sql: kyselySql,
    setTimeout,
    clearTimeout,
    __safeqlResultSql: undefined,
  };
}

// Tracks the embedded raw `sql` fragments of a builder chain — the only thing
// builder mode validates (a pure builder is left to Kysely's types). The
// fragment source ranges drive sourcemapping so a DB error squiggles the
// offending fragment instead of a misplaced offset in the compiled SQL.
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

/**
 * Render a fluent builder chain back to source the sandbox can evaluate, while
 * statically classifying every runtime value and rendering embedded `sql`
 * fragments through. Returns `undefined` (→ skip) when any part of the chain is
 * not statically reconstructible.
 */
function renderBuilderChain(
  node: ts.Expression,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  state: RenderState,
): string | undefined {
  const unwrapped = ast.unwrap({ node: node });

  // The builder root (`db` / `trx` / `this.db`) becomes the sandbox DB.
  if (isSupportedBuilderRoot(unwrapped)) {
    return "__safeqlDb";
  }

  // A supported, statically-constructed Kysely plugin instance (e.g. inside
  // `.withPlugin(new CamelCasePlugin())`).
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

  // Bare identifiers, element access, templates, etc. that reach this point are
  // free variables in a structural position → not reconstructible.
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

/**
 * Render the argument list of a single builder method call. The value position
 * of a where-like call with a scalar operator may hold a free variable (it
 * becomes a bound parameter); every other position must be statically known
 * (or an embedded `sql` fragment).
 */
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
      // Free/dynamic column or operator drives SQL structure → skip.
      return undefined;
    }

    const value = ast.getStaticValue({ node: args[2], checker: checker });
    let valueText: string;
    if (value !== ast.UNRESOLVED) {
      valueText = staticValueToSource(value);
    } else if (safeValueOperators.has(operator)) {
      // Free variable in a parameterized value slot → stub a bound param.
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

  // An embedded `sql` fragment, e.g. `sql`...`` or `sql`...`.as("alias")`.
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
    // A free variable outside a safe value position (column/table/etc.) → skip.
    return undefined;
  }

  return staticValueToSource(value);
}

/** Whether `node` is (or its receiver chain bottoms out in) a kysely `sql` tag. */
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

/**
 * Render a `sql` fragment expression chain (`sql`...`` or `sql`...`.as("x")`)
 * into sandbox-evaluable source, marking that the chain embeds raw sql.
 */
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

/**
 * Reconstruct a `sql`...`` fragment for the sandbox. Quasis are kept verbatim;
 * each `${…}` interpolation is rendered as either a kysely helper/nested
 * fragment (evaluated as-is — a dynamic argument throws and skips the query) or,
 * for a plain value, a stub literal that compiles to a bound parameter.
 */
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

  // A kysely helper (`sql.ref(...)`, `sql.lit(...)`, …) or a nested `sql`
  // fragment is rendered as-is; the sandbox evaluates it (a dynamic argument
  // throws → skip). Everything else is a value → a bound-parameter stub.
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

function getBuilderRootExpression(node: ts.Node): ts.Node {
  let current = node;

  while (true) {
    if (ts.isPropertyAccessExpression(current) || ts.isCallExpression(current)) {
      current = current.expression;
      continue;
    }

    if (
      ts.isAsExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current)
    ) {
      current = current.expression;
      continue;
    }

    break;
  }

  return current;
}

function isSupportedBuilderRoot(node: ts.Node): boolean {
  if (ts.isIdentifier(node)) {
    return allowedBuilderRoots.has(node.text);
  }

  return (
    ts.isPropertyAccessExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ThisKeyword &&
    allowedBuilderRoots.has(node.name.text)
  );
}

function buildBuilderDatabaseExpression(): string {
  // The base DB has no plugins: identifier-rewriting plugins
  // (`CamelCasePlugin`, …) are applied inline via `.withPlugin(new X())` when
  // they appear in the chain itself.
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

const kyselyColumnWrappers = new Set(["ColumnType", "Generated", "JSONColumnType"]);

/**
 * Interpret a Kysely `Database` interface: each top-level property is a table,
 * each table property a column. For every column we hand back its *SELECT* type
 * (Kysely's `ColumnType<S,…>`/`Generated<T>`/`JSONColumnType<T>` unwrapped to
 * `S`/`T`) so the rule can diff it against the live database.
 */
function resolveSchemaType(context: SchemaTypeContext): ResolvedSchemaType | undefined {
  const { checker, parser, sourceFile, typeName } = context;

  const declaration = findSchemaTypeDeclaration(sourceFile, typeName);
  if (declaration === undefined) {
    return undefined;
  }

  const databaseType = checker.getTypeAtLocation(declaration);
  const tables: ResolvedSchemaTable[] = [];

  for (const tableSymbol of checker.getPropertiesOfType(databaseType)) {
    const tableDeclaration = tableSymbol.declarations?.[0];
    if (tableDeclaration === undefined) {
      continue;
    }

    const tableReportNode = parser.tsNodeToESTreeNodeMap.get(tableDeclaration);
    if (tableReportNode === undefined) {
      continue;
    }

    const tableType = checker.getTypeOfSymbolAtLocation(tableSymbol, tableDeclaration);
    const columns: ResolvedSchemaColumn[] = [];

    for (const columnSymbol of checker.getPropertiesOfType(tableType)) {
      const columnDeclaration = columnSymbol.declarations?.[0];
      if (columnDeclaration === undefined) {
        continue;
      }

      const columnReportNode = parser.tsNodeToESTreeNodeMap.get(columnDeclaration);
      if (columnReportNode === undefined) {
        continue;
      }

      const columnType = checker.getTypeOfSymbolAtLocation(columnSymbol, columnDeclaration);

      columns.push({
        name: columnSymbol.name,
        type: unwrapKyselyColumnType(columnType, checker),
        typeNode: columnDeclaration,
        reportNode: columnReportNode,
      });
    }

    tables.push({ name: tableSymbol.name, reportNode: tableReportNode, columns });
  }

  return { tables };
}

function findSchemaTypeDeclaration(
  sourceFile: ts.SourceFile,
  typeName: string,
): ts.InterfaceDeclaration | ts.TypeAliasDeclaration | undefined {
  for (const statement of sourceFile.statements) {
    if (
      (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
      statement.name.text === typeName
    ) {
      return statement;
    }
  }

  return undefined;
}

function unwrapKyselyColumnType(type: ts.Type, checker: ts.TypeChecker): ts.Type {
  // `ColumnType<S,…>`/`Generated<T>`/`JSONColumnType<T>` carry their name on the
  // *alias* symbol; the resolved object type's own symbol is anonymous
  // (`__type`). The first type argument is always the SELECT type.
  const aliasSymbol = type.aliasSymbol;
  if (
    aliasSymbol !== undefined &&
    kyselyColumnWrappers.has(aliasSymbol.name) &&
    ast.isSymbolImportedFrom({ checker: checker, symbol: aliasSymbol, moduleName: "kysely" })
  ) {
    const aliasArguments = type.aliasTypeArguments;
    if (aliasArguments !== undefined && aliasArguments.length > 0) {
      return aliasArguments[0];
    }
  }

  // `ColumnType` written directly (instantiated as a type reference).
  const symbol = type.getSymbol();
  if (
    symbol !== undefined &&
    kyselyColumnWrappers.has(symbol.name) &&
    ast.isSymbolImportedFrom({ checker: checker, symbol: symbol, moduleName: "kysely" })
  ) {
    const typeArguments = checker.getTypeArguments(type as ts.TypeReference);
    if (typeArguments.length > 0) {
      return typeArguments[0];
    }
  }

  return type;
}

function buildExpressionSQL(node: ts.Node, checker: ts.TypeChecker): string | false | undefined {
  const expression = ast.unwrap({ node: node });

  // Nested `sql`...`` fragment — splice its SQL in.
  if (ts.isTaggedTemplateExpression(expression) && isKyselyTag(expression.tag, checker)) {
    return buildTemplateSQL(expression.template, checker);
  }

  // An identifier may point at a fragment variable or a static value.
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
      // Bound parameter. Emit a bare placeholder (no cast) and let Postgres infer.
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

  // Only a literal `sql`...`` separator is resolved. A separator held in a
  // variable isn't followed through to its initializer, so it resolves to
  // `false` and the whole query is skipped (rather than guessed).
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

  // Walk the postfix member/call chain that starts at the tag, e.g.
  // `sql`...`.execute(db)` or `sql`...`.as('x')`.
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

  // Passed as an argument to another call (e.g. `.where(sql`...`)`) → fragment.
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
