import type { ParserServices, TSESLint, TSESTree } from "@typescript-eslint/utils";
import type ts from "typescript";
import type { Sql } from "postgres";

export interface ExpressionContext {
  precedingSQL: string;
  checker: ts.TypeChecker;
  tsNode: ts.Node;
  tsType: ts.Type;
  tsTypeText: string;
}

/** Context passed to `onTarget` so the plugin can resolve imports, types, etc. */
export interface TargetContext {
  checker: ts.TypeChecker;
  parser: ParserServices;
}

export interface SafeQLPlugin {
  name: string;

  /**
   * Default values to deep-merge into the connection config.
   * User-provided values always take priority.
   *
   * Useful for setting library-specific type overrides, e.g.:
   * ```ts
   * connectionDefaults: {
   *   overrides: { types: { date: "DateSqlToken" } }
   * }
   * ```
   */
  connectionDefaults?: Record<string, unknown>;

  createConnection?: {
    cacheKey: string;
    handler(): Promise<Sql>;
  };

  /**
   * Called for each TaggedTemplateExpression. Decides whether the tag is a SQL query.
   *
   * Return:
   *   - TargetMatch object → this is a SQL query, with configuration
   *   - false              → skip this tag entirely
   *   - undefined          → defer to next plugin / SafeQL default
   */
  onTarget?(params: {
    node: TSESTree.TaggedTemplateExpression;
    context: TargetContext;
  }): TargetMatch | false | undefined;

  /**
   * Called for each interpolated expression inside a matched template.
   * Return: string (inline SQL) | false (skip entire query) | undefined (default $N::type).
   */
  onExpression?(params: {
    node: TSESTree.Expression;
    context: ExpressionContext;
  }): string | false | undefined;
}

/** Structural mirror of `ResolvedTarget` from `@ts-safeql/generate`, so plugins never depend on generate. */
export type PluginResolvedTarget =
  | { kind: "type"; value: string }
  | { kind: "literal"; value: string; base: PluginResolvedTarget }
  | { kind: "union"; value: PluginResolvedTarget[] }
  | { kind: "array"; value: PluginResolvedTarget }
  | { kind: "object"; value: [string, PluginResolvedTarget][] };

/**
 * Check whether `actual` (the DB-resolved type) is assignable to `expected`
 * (the user-declared type, e.g. from a Zod schema).
 *
 * Follows TypeScript semantics:
 *  - `literal("alice")` is assignable to `string`
 *  - `number` is assignable to `any` / `unknown`
 *  - `string` is assignable to `string | null`
 *  - `union(A, B)` is assignable to `C` when every member is assignable to `C`
 */
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

/**
 * Context passed to a plugin's `typeCheck` callback after the worker produces
 * a result. Plugins use this to compare their own expected type (e.g., a Zod
 * schema) against the DB-resolved output.
 */
export interface TypeCheckContext {
  node: TSESTree.TaggedTemplateExpression;
  /** The DB-resolved output columns. */
  output: PluginResolvedTarget;
  checker: ts.TypeChecker;
  parser: ParserServices;
  sourceCode: Readonly<TSESLint.SourceCode>;
  /** Convert a resolved target to a comparable, normalised string. */
  getComparableString(target: PluginResolvedTarget): string;
}

/**
 * Returned by a plugin's `typeCheck` when the types do not match.
 */
export interface TypeCheckReport {
  /** Human-readable error message. */
  message: string;
  /** Node to report the error on (defaults to the tag expression). */
  node?: TSESTree.Node;
  /** Auto-fix: node to replace and its replacement text. */
  fix?: { node: TSESTree.Node; text: string };
}

export interface TargetMatch {
  /** Skip type annotation checking for this query (e.g., sql.unsafe). */
  skipTypeAnnotations?: boolean;
  /**
   * Custom type check callback. When provided, SafeQL delegates type comparison
   * to the plugin instead of running the built-in type annotation check.
   *
   * Return a `TypeCheckReport` to report a mismatch, or `undefined` if types match.
   */
  typeCheck?: (ctx: TypeCheckContext) => TypeCheckReport | undefined;
}

export interface PluginDescriptor {
  package: string;
  config?: Record<string, unknown>;
}

export interface DefinePluginOptions<TConfig> {
  /** Short name, e.g. `"aws-iam"`. Automatically prefixed with `safeql-plugin-`. */
  name: string;
  /** The npm package name, e.g. `"@ts-safeql/plugin-auth-aws"`. */
  package: string;
  /** Receives user config, returns hooks. */
  setup: (config: TConfig) => Omit<SafeQLPlugin, "name">;
}

/**
 * The return type of `definePlugin`. Callable as a config helper,
 * with a `.factory` property used by the worker at runtime.
 */
export type SafeQLPluginExport<TConfig> = ({} extends TConfig
  ? { (): PluginDescriptor; (config: TConfig): PluginDescriptor }
  : { (config: TConfig): PluginDescriptor }) & {
  factory: (config: TConfig) => SafeQLPlugin;
};

/**
 * Define a SafeQL plugin.
 *
 * Returns a callable that serves as both the user-facing config helper
 * and (via `.factory`) the worker-side plugin factory.
 *
 * @example
 * ```ts
 * // my-plugin/src/index.ts
 * export default definePlugin<MyConfig>({
 *   name: "my-db",
 *   package: "safeql-plugin-my-db",
 *   setup(config) {
 *     return {
 *       createConnection: {
 *         cacheKey: `my-db://${config.host}`,
 *         async handler() { return postgres(config.host); },
 *       },
 *     };
 *   },
 * });
 *
 * // eslint.config.js
 * import myDb from "safeql-plugin-my-db";
 * plugins: [myDb({ host: "localhost" })]
 * ```
 */
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
