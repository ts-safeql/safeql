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
  tsType: ts.Type;
  tsTypeText: string;
}

export interface ResolvedSchemaColumn {
  /** Column name as declared in the schema type (the rule matches it against the
   * DB column name after applying `fieldTransform`). */
  name: string;
  /** The column's SELECT type, with any library-specific column wrappers
   * already unwrapped. */
  type: ts.Type;
  /** Anchor node for resolving {@link type} via the checker. */
  typeNode: ts.Node;
  /** Where to report drift for this column. */
  reportNode: TSESTree.Node;
}

export interface ResolvedSchemaTable {
  /** Table name as declared in the schema type (matched against the DB table name). */
  name: string;
  /** Where to report table-level drift. */
  reportNode: TSESTree.Node;
  columns: ResolvedSchemaColumn[];
}

export interface ResolvedSchemaType {
  tables: ResolvedSchemaTable[];
}

export interface SchemaTypeContext {
  checker: ts.TypeChecker;
  parser: ParserServices;
  sourceFile: ts.SourceFile;
  /** The configured schema type to locate (e.g. `"Database"`). */
  typeName: string;
}

export type ResolvedQuery = {
  kind: "sql";
  text: string;
  sourcemaps: QuerySourceMapEntry[];
  expectedType?: ts.Node;
};

/**
 * Passed to a plugin's {@link SafeQLPlugin.migrate} hook. Describes the
 * freshly-created, empty shadow database that the project's migrations should
 * be applied to.
 */
export interface MigrateContext {
  /** Connection URL of the shadow database. */
  databaseUrl: string;
  /** postgres.js client already connected to the shadow database. */
  sql: Sql;
  /** Absolute path to the migrations directory (`projectDir` + `migrationsDir`). */
  migrationsDir: string;
  /** Absolute path to the consuming project. */
  projectDir: string;
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
   * Apply the project's migrations to a freshly-created shadow database.
   *
   * When present, this replaces SafeQL's built-in `.sql` file runner for
   * `migrationsDir` connections, letting an ORM or migration tool run
   * migrations its own way. Called once, when the shadow database is first
   * created. Throw to surface a migration failure as a lint error.
   */
  migrate?(context: MigrateContext): Promise<void>;

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
   * Non-tag query entrypoint (e.g. builder chains). When provided, SafeQL calls
   * `resolveQuery` for selected AST nodes and expects SQL to run through the normal
   * validation pipeline.
   * Rule-only hook: this runs in the checker process and may use the TS checker.
   */
  queryNodeKinds?: Array<"TaggedTemplateExpression" | "CallExpression">;
  resolveQuery?(params: ResolveQueryContext): ResolvedQuery | "skip";

  /**
   * Locate and interpret the project's schema type (e.g. a generated `Database`
   * type) for schema-drift validation (`check-schema`).
   * Rule-only hook: runs in the checker process and returns checker-bound nodes
   * (never serialized to the worker — the drift diff runs rule-side).
   */
  resolveSchemaType?(params: SchemaTypeContext): ResolvedSchemaType | undefined;

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

/** Shared TypeScript-AST toolkit for plugins (symbol origin, static evaluation, unwrapping). */
export * as ast from "./ast";
