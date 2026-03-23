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

  async resolveConnection(
    descriptors: PluginDescriptor[],
    projectDir: string,
  ): Promise<ResolvedConnection | undefined> {
    const plugins = descriptors.map((d) => this.resolveOne(d, projectDir));
    return this.pickConnection(plugins);
  }

  getCachedConnection(descriptors: PluginDescriptor[]): ResolvedConnection | undefined {
    const plugins = descriptors
      .map((d) => this.pluginCache.get(this.getCacheKey(d)))
      .filter((p): p is SafeQLPlugin => p !== undefined);

    return this.pickConnection(plugins);
  }

  /** Synchronous — for use in the main ESLint thread (onTarget/onExpression hooks). */
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
    return `${descriptor.package}:${stableStringify(descriptor.config ?? {})}`;
  }

  private resolveOneSync(descriptor: PluginDescriptor, projectDir: string): SafeQLPlugin {
    const key = this.getCacheKey(descriptor);
    const cached = this.pluginCache.get(key);
    if (cached) return cached;

    const mod = this.loadModuleSync(descriptor.package, projectDir);

    const plugin = this.extractPlugin(descriptor, mod);
    this.pluginCache.set(key, plugin);
    return plugin;
  }

  private resolveOne(descriptor: PluginDescriptor, projectDir: string): SafeQLPlugin {
    return this.resolveOneSync(descriptor, projectDir);
  }

  private loadModuleSync(packageName: string, projectDir: string): unknown {
    const projectRequire = createRequire(path.resolve(projectDir, "package.json"));

    try {
      if (isLocalPath(packageName)) {
        const pluginPath = path.resolve(projectDir, packageName);
        const tsx = createRequire(import.meta.url)(`tsx/cjs/api`);
        return tsx.require(pluginPath, import.meta.url);
      }

      return projectRequire(packageName);
    } catch (cause) {
      throw new Error(`SafeQL plugin "${packageName}" could not be loaded. Is it installed?`, {
        cause,
      });
    }
  }

  private extractPlugin(descriptor: PluginDescriptor, mod: unknown): SafeQLPlugin {
    const factory = getFactory(mod);

    if (!factory) {
      throw new Error(
        `SafeQL plugin "${descriptor.package}" must default-export a definePlugin() result. See @ts-safeql/plugin-utils.`,
      );
    }

    const plugin = factory(descriptor.config ?? {});

    if (!isPluginShaped(plugin)) {
      throw new Error(
        `SafeQL plugin "${descriptor.package}" factory must return an object with at least a "name" property.`,
      );
    }

    return plugin;
  }
}

type PluginFactory = (config: Record<string, unknown>) => unknown;

function isPluginShaped(value: unknown): value is SafeQLPlugin {
  return (
    typeof value === "object" && value !== null && typeof (value as SafeQLPlugin).name === "string"
  );
}

function prop(obj: unknown, key: string): unknown {
  if ((typeof obj === "object" || typeof obj === "function") && obj !== null && key in obj) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

function getFactory(mod: unknown): PluginFactory | undefined {
  const defaultExport = prop(mod, "default");

  // definePlugin() attaches .factory to the default export
  const factory = prop(defaultExport, "factory");
  if (typeof factory === "function") return factory as PluginFactory;

  // CJS double-wraps: mod.default.default.factory
  const nestedFactory = prop(prop(defaultExport, "default"), "factory");
  if (typeof nestedFactory === "function") return nestedFactory as PluginFactory;

  // Direct .factory on the module
  const directFactory = prop(mod, "factory");
  if (typeof directFactory === "function") return directFactory as PluginFactory;

  return undefined;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const entries = Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

function isLocalPath(packageName: string): boolean {
  return packageName.startsWith(".") || path.isAbsolute(packageName);
}
