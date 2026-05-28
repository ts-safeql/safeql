# @ts-safeql/plugin-slonik

## 4.3.0

### Minor Changes

- 4568532: Publish the experimental Slonik plugin and tighten plugin resolution behavior.

  **`@ts-safeql/plugin-utils` (breaking for direct consumers of `PluginManager`):**

  - `resolveConnection`, `resolvePluginsSync`, `getCachedConnection`, and `evictPlugins` now require a `projectDir` argument so the plugin cache key is per-project.
  - `resolveConnection` is synchronous (it never did async work).

  **`@ts-safeql/eslint-plugin`:**

  - When multiple plugins are configured, `onTarget` resolves to the first plugin returning a non-`undefined` result instead of the last. This matches the documented "defer to the next plugin" contract.
