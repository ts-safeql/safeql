import type { Sql } from "postgres";

export interface SafeQLPlugin {
  name: string;

  createConnection?: {
    cacheKey: string;
    handler(): Promise<Sql>;
  };
}

export interface PluginDescriptor {
  package: string;
  config: Record<string, unknown>;
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
export type SafeQLPluginExport<TConfig> = {
  (config: TConfig): PluginDescriptor;
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
export function definePlugin<TConfig extends Record<string, unknown>>(
  options: DefinePluginOptions<TConfig>,
): SafeQLPluginExport<TConfig> {
  const fullName = `safeql-plugin-${options.name}`;

  const configHelper = (config: TConfig): PluginDescriptor => ({
    package: options.package,
    config: config as Record<string, unknown>,
  });

  configHelper.factory = (config: TConfig): SafeQLPlugin => ({
    name: fullName,
    ...options.setup(config),
  });

  return configHelper;
}

export { PluginManager } from "./resolve";
