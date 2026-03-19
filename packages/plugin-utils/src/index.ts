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

export interface TargetContext {
  checker: ts.TypeChecker;
  parser: ParserServices;
}

/**
 * The object returned by a plugin's `setup` function (plus `name`).
 * Each property is an optional hook into SafeQL's analysis pipeline.
 */
export interface SafeQLPlugin {
  name: string;

  /** Deep-merged into the connection config. User-provided values always win. */
  connectionDefaults?: Record<string, unknown>;

  createConnection?: {
    /** Stable identifier for connection deduplication. Same key reuses the existing connection. */
    cacheKey: string;
    handler(): Promise<Sql>;
  };

  /**
   * Called for every `TaggedTemplateExpression` in the file.
   *
   * @returns `TargetMatch` to check this tag as SQL,
   *          `false` to skip it,
   *          `undefined` to defer to the next plugin or SafeQL's default matching.
   */
  onTarget?(params: {
    node: TSESTree.TaggedTemplateExpression;
    context: TargetContext;
  }): TargetMatch | false | undefined;

  /**
   * Called for each interpolated expression inside a matched template.
   *
   * @returns A SQL fragment (use `$N` as the positional placeholder),
   *          `false` to skip the entire query,
   *          `undefined` to use SafeQL's default `$N::type` behaviour.
   */
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

/**
 * Checks whether `actual` (DB-resolved type) is assignable to `expected`
 * (user-declared type, e.g. from a Zod schema) using TypeScript semantics.
 *
 * @param actual   - What the query actually returns.
 * @param expected - What the plugin or user declared.
 * @returns `true` when `actual` is assignable to `expected`.
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

/** Passed to a plugin's {@link TargetMatch.typeCheck} after the query is resolved against the database. */
export interface TypeCheckContext {
  node: TSESTree.TaggedTemplateExpression;
  /** What the query actually returns (DB-resolved columns). */
  output: PluginResolvedTarget;
  checker: ts.TypeChecker;
  parser: ParserServices;
  sourceCode: Readonly<TSESLint.SourceCode>;
  /** Normalises a target into a stable string, respecting `nullAsOptional` / `nullAsUndefined`. */
  getComparableString(target: PluginResolvedTarget): string;
}

/**
 * Returned by {@link TargetMatch.typeCheck} when the types do not match.
 * Return `undefined` from `typeCheck` when the types are correct.
 */
export interface TypeCheckReport {
  message: string;
  /** Defaults to the tag expression when omitted. */
  node?: TSESTree.Node;
  /** When provided, ESLint will offer an auto-fix replacing `node` with `text`. */
  fix?: { node: TSESTree.Node; text: string };
}

export interface TargetMatch {
  skipTypeAnnotations?: boolean;
  /** When set, SafeQL delegates type comparison to the plugin instead of the built-in check. */
  typeCheck?: (ctx: TypeCheckContext) => TypeCheckReport | undefined;
}

/** Serialisable descriptor produced by the config helper and consumed by the worker. */
export interface PluginDescriptor {
  package: string;
  config?: Record<string, unknown>;
}

export interface DefinePluginOptions<TConfig> {
  /** Prefixed with `safeql-plugin-` automatically. */
  name: string;
  /** npm package name. Used to resolve the plugin in the worker. */
  package: string;
  setup: (config: TConfig) => Omit<SafeQLPlugin, "name">;
}

export type SafeQLPluginExport<TConfig> = ({} extends TConfig
  ? { (): PluginDescriptor; (config: TConfig): PluginDescriptor }
  : { (config: TConfig): PluginDescriptor }) & {
  factory: (config: TConfig) => SafeQLPlugin;
};

/**
 * Define a SafeQL plugin. The returned function is both the user-facing config
 * helper and (via `.factory`) the worker-side plugin constructor.
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
