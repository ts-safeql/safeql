import { createRequire } from "module";
import path from "path";
import type { PluginDescriptor, SafeQLPlugin } from "./index";
import type { Sql } from "postgres";

export type ResolvedConnection = {
  pluginName: string;
  cacheKey: string;
  handler: () => Promise<Sql>;
};

export class PluginManager {
  private readonly pluginCache = new Map<string, SafeQLPlugin>();

  /**
   * Resolve plugin descriptors and return the connection hook from the last
   * plugin that provides `createConnection`. Returns `undefined` if none does.
   */
  async resolveConnection(
    descriptors: PluginDescriptor[],
    projectDir: string,
  ): Promise<ResolvedConnection | undefined> {
    const plugins = await Promise.all(descriptors.map((d) => this.resolveOne(d, projectDir)));

    return this.pickConnection(plugins);
  }

  /**
   * Same as `resolveConnection` but only looks at already-cached plugin instances.
   */
  getCachedConnection(descriptors: PluginDescriptor[]): ResolvedConnection | undefined {
    const plugins = descriptors
      .map((d) => this.pluginCache.get(this.getCacheKey(d)))
      .filter((p): p is SafeQLPlugin => p !== undefined);

    return this.pickConnection(plugins);
  }

  /**
   * Synchronously resolve plugin descriptors into live plugin instances.
   * For use in the main ESLint thread (onTarget/onExpression hooks).
   */
  resolvePluginsSync(descriptors: PluginDescriptor[], projectDir: string): SafeQLPlugin[] {
    return descriptors.map((d) => this.resolveOneSync(d, projectDir));
  }

  evictPlugins(descriptors: PluginDescriptor[]): void {
    for (const descriptor of descriptors) {
      this.pluginCache.delete(this.getCacheKey(descriptor));
    }
  }

  private pickConnection(plugins: SafeQLPlugin[]): ResolvedConnection | undefined {
    let result: ResolvedConnection | undefined;

    for (const plugin of plugins) {
      if (plugin.createConnection) {
        result = {
          pluginName: plugin.name,
          cacheKey: plugin.createConnection.cacheKey,
          handler: plugin.createConnection.handler,
        };
      }
    }

    return result;
  }

  private getCacheKey(descriptor: PluginDescriptor): string {
    const config = descriptor.config ?? {};
    return `${descriptor.package}:${JSON.stringify(config, Object.keys(config).sort())}`;
  }

  private resolveOneSync(descriptor: PluginDescriptor, projectDir: string): SafeQLPlugin {
    const key = this.getCacheKey(descriptor);
    const cached = this.pluginCache.get(key);

    if (cached) {
      return cached;
    }

    const projectRequire = createRequire(path.resolve(projectDir, "package.json"));

    let mod: Record<string, unknown>;
    try {
      mod = projectRequire(descriptor.package) as Record<string, unknown>;
    } catch {
      throw new Error(
        `SafeQL plugin "${descriptor.package}" could not be loaded. Is it installed?`,
      );
    }

    const plugin = this.extractPlugin(descriptor, mod);
    this.pluginCache.set(key, plugin);
    return plugin;
  }

  private async resolveOne(
    descriptor: PluginDescriptor,
    projectDir: string,
  ): Promise<SafeQLPlugin> {
    const key = this.getCacheKey(descriptor);
    const cached = this.pluginCache.get(key);

    if (cached) {
      return cached;
    }

    const projectRequire = createRequire(path.join(projectDir, "package.json"));

    let mod: { default?: unknown };
    try {
      const resolved = projectRequire.resolve(descriptor.package);
      mod = await import(resolved);
    } catch {
      throw new Error(
        `SafeQL plugin "${descriptor.package}" could not be loaded. Is it installed?`,
      );
    }

    const plugin = this.extractPlugin(descriptor, mod as Record<string, unknown>);
    this.pluginCache.set(key, plugin);
    return plugin;
  }

  private extractPlugin(descriptor: PluginDescriptor, mod: Record<string, unknown>): SafeQLPlugin {
    const rawDefault = mod.default as Record<string, unknown> | undefined;
    const withFactory =
      rawDefault?.factory ??
      (rawDefault?.default as Record<string, unknown>)?.factory ??
      mod.factory;

    if (typeof withFactory !== "function") {
      throw new Error(
        `SafeQL plugin "${descriptor.package}" must default-export a definePlugin() result. See @ts-safeql/plugin-utils.`,
      );
    }

    const plugin = withFactory(descriptor.config ?? {}) as SafeQLPlugin;

    if (!plugin || typeof plugin.name !== "string") {
      throw new Error(
        `SafeQL plugin "${descriptor.package}" factory must return an object with at least a "name" property.`,
      );
    }

    return plugin;
  }
}
