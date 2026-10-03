import type { ParserServices, TSESLint, TSESTree } from "@typescript-eslint/utils";
import type ts from "typescript";
import type { Sql } from "postgres";

export type QuerySourceMapEntry = {
  original: {
    start: number;
    end: number;
    text: string;
  };
  generated: {
    start: number;
    end: number;
    text: string;
  };
  offset: number;
};

export interface ExpressionContext {
  precedingSQL: string;
  checker: ts.TypeChecker;
  tsNode: ts.Node;
  tsType: ts.Type;
  tsTypeText: string;
}

export interface TargetContext {
  checker: ts.TypeChecker;
  parser: ParserServices;
}

export interface ResolveQueryContext {
  checker: ts.TypeChecker;
  parser: ParserServices;
  precedingSQL: string;
  tsNode: ts.Node;
  // Supplied lazily by the core; a resolver that gates syntactically and never reads them
  // pays no checker cost.
  readonly tsType: ts.Type;
  readonly tsTypeText: string;
}

// Declarative selector for a non-tag query node. The core matches these syntactically and
// never interprets what the names mean, so no library vocabulary leaks into the engine.
// `callee.property.nameIn` admits a non-computed member call whose method name is listed;
// omit it to admit every CallExpression (the plugin must then disown via `resolveQuery` "skip").
export type QueryNodeSelector =
  | { kind: "CallExpression"; callee?: { property?: { nameIn: string[] } } }
  | { kind: "TaggedTemplateExpression" };

export function matchesQueryNodeSelector(
  node: TSESTree.Node,
  selector: QueryNodeSelector,
): boolean {
  if (selector.kind === "TaggedTemplateExpression") {
    return node.type === "TaggedTemplateExpression";
  }

  if (node.type !== "CallExpression") {
    return false;
  }

  const nameIn = selector.callee?.property?.nameIn;
  if (nameIn === undefined) {
    return true;
  }

  return (
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    nameIn.includes(node.callee.property.name)
  );
}

// Passed to `ResolvedQuery.typeCheck`, the deferred check the core runs once the query's row
// type is known. A builder plugin uses it to validate the `<T>` a user wrote on an embedded
// `sql` fragment against the type the database actually produced.
export interface ResolvedQueryTypeCheckContext {
  terminal: TSESTree.CallExpression;
  output: PluginResolvedTarget | null;
  checker: ts.TypeChecker;
  parser: ParserServices;
  sourceCode: Readonly<TSESLint.SourceCode>;
  getComparableString(target: PluginResolvedTarget): string;
  // Resolve a user-written `<T>` into the same shape the database output uses, so the two are comparable.
  resolveExpectedType(typeNode: TSESTree.TypeNode): PluginResolvedTarget | null;
}

// A wrong `<T>` annotation. The core renders it like any other incorrect annotation: its
// standard message plus an autofix that rewrites the type parameter to `actual`.
export interface IncorrectTypeAnnotationReport {
  kind: "incorrect-type-annotation";
  typeParameter: TSESTree.TSTypeParameterInstantiation;
  expected: string | null;
  actual: string | null;
}

export type ResolvedQueryTypeCheckResult = TypeCheckReport | IncorrectTypeAnnotationReport;

export interface ResolvedQuery {
  kind: "sql";
  text: string;
  sourcemaps: QuerySourceMapEntry[];
  // A query can embed several fragments, so the check reports one result per problem (none → `undefined`).
  typeCheck?: (
    ctx: ResolvedQueryTypeCheckContext,
  ) => readonly ResolvedQueryTypeCheckResult[] | undefined;
}

// The freshly-created, empty shadow database to apply the project's migrations to.
export interface MigrateContext {
  databaseUrl: string;
  sql: Sql;
  migrationsDir: string;
  projectDir: string;
}

// The object a plugin's `setup` returns (plus `name`); each property is an optional pipeline hook.
export interface SafeQLPlugin {
  name: string;

  // Deep-merged into the connection config; user-provided values win.
  connectionDefaults?: Record<string, unknown>;

  createConnection?: {
    // Same key reuses an existing connection.
    cacheKey: string;
    handler(): Promise<Sql>;
  };

  // Apply project migrations to the shadow DB, replacing the built-in `.sql` runner. Throw to surface failures.
  migrate?(context: MigrateContext): Promise<void>;

  // Returns a TargetMatch to check the tag, `false` to skip, `undefined` to defer.
  onTarget?(params: {
    node: TSESTree.TaggedTemplateExpression;
    context: TargetContext;
  }): TargetMatch | false | undefined;

  // Non-tag query entrypoint (e.g. builder chains). Rule-only hook (runs in the checker process).
  queryNodeKinds?: QueryNodeSelector[];
  resolveQuery?(params: ResolveQueryContext): ResolvedQuery | "skip";

  // Per interpolated expression: a SQL fragment (`$N` placeholder), `false` to skip, `undefined` for default `$N::type`.
  onExpression?(params: {
    node: TSESTree.Expression;
    context: ExpressionContext;
  }): string | false | undefined;
}

export type PluginResolvedTarget =
  | { kind: "type"; value: string }
  | { kind: "literal"; value: string; base: PluginResolvedTarget }
  | { kind: "union"; value: PluginResolvedTarget[] }
  | { kind: "array"; value: PluginResolvedTarget }
  | { kind: "object"; value: [string, PluginResolvedTarget][] };

// Whether `actual` (DB-resolved) is assignable to `expected` (user-declared) under TypeScript semantics.
export function isAssignableTo(
  actual: PluginResolvedTarget,
  expected: PluginResolvedTarget,
): boolean {
  if (expected.kind === "type" && (expected.value === "any" || expected.value === "unknown")) {
    return true;
  }

  if (actual.kind === "type" && actual.value === "any") {
    return true;
  }

  if (actual.kind === "union") {
    return actual.value.every((member) => isAssignableTo(member, expected));
  }

  if (expected.kind === "union") {
    return expected.value.some((member) => isAssignableTo(actual, member));
  }

  if (actual.kind === "literal" && expected.kind === "type") {
    return isLiteralOfType(actual.value, expected.value);
  }

  if (actual.kind === "type" && expected.kind === "type") {
    return actual.value === expected.value;
  }

  if (actual.kind === "literal" && expected.kind === "literal") {
    return actual.value === expected.value;
  }

  if (actual.kind === "array" && expected.kind === "array") {
    return isAssignableTo(actual.value, expected.value);
  }

  if (actual.kind === "object" && expected.kind === "object") {
    if (actual.value.length !== expected.value.length) return false;
    for (const [name, actualType] of actual.value) {
      const expectedProp = expected.value.find(([n]) => n === name);
      if (!expectedProp) return false;
      if (!isAssignableTo(actualType, expectedProp[1])) return false;
    }
    return true;
  }

  return false;
}

function isLiteralOfType(literalValue: string, typeName: string): boolean {
  if (typeName === "string") return literalValue.startsWith("'") || literalValue.startsWith('"');
  if (typeName === "number") return !Number.isNaN(Number(literalValue));
  if (typeName === "boolean") return literalValue === "true" || literalValue === "false";
  if (typeName === "bigint") return literalValue.endsWith("n");
  return false;
}

export interface TypeCheckContext {
  node: TSESTree.TaggedTemplateExpression;
  output: PluginResolvedTarget;
  checker: ts.TypeChecker;
  parser: ParserServices;
  sourceCode: Readonly<TSESLint.SourceCode>;
  getComparableString(target: PluginResolvedTarget): string;
}

// Return from `typeCheck` only on mismatch (`undefined` when types are correct).
export interface TypeCheckReport {
  message: string;
  node?: TSESTree.Node;
  fix?: { node: TSESTree.Node; text: string };
}

export interface TargetMatch {
  skipTypeAnnotations?: boolean;
  // When set, SafeQL delegates type comparison to the plugin.
  typeCheck?: (ctx: TypeCheckContext) => TypeCheckReport | undefined;
}

export interface PluginDescriptor {
  package: string;
  config?: Record<string, unknown>;
}

export interface DefinePluginOptions<TConfig> {
  // Prefixed with `safeql-plugin-` automatically.
  name: string;
  package: string;
  setup: (config: TConfig) => Omit<SafeQLPlugin, "name">;
}

export type SafeQLPluginExport<TConfig> = ({} extends TConfig
  ? { (): PluginDescriptor; (config: TConfig): PluginDescriptor }
  : { (config: TConfig): PluginDescriptor }) & {
  factory: (config: TConfig) => SafeQLPlugin;
};

// The returned function is both the user-facing config helper and (via `.factory`) the worker-side constructor.
export function definePlugin<TConfig extends Record<string, unknown> = {}>(
  options: DefinePluginOptions<TConfig>,
): SafeQLPluginExport<TConfig> {
  const fullName = `safeql-plugin-${options.name}`;

  const configHelper = (config?: TConfig): PluginDescriptor => ({
    package: options.package,
    config: (config ?? {}) as Record<string, unknown>,
  });

  configHelper.factory = (config: TConfig): SafeQLPlugin => ({
    name: fullName,
    ...options.setup(config),
  });

  return configHelper;
}

export { PluginManager } from "./resolve";

export * as ast from "./ast";
