# @ts-safeql/plugin-utils

## 5.1.0

### Minor Changes

- 4568532: Publish the experimental Slonik plugin and tighten plugin resolution behavior.

  **`@ts-safeql/plugin-utils` (breaking for direct consumers of `PluginManager`):**

  - `resolveConnection`, `resolvePluginsSync`, `getCachedConnection`, and `evictPlugins` now require a `projectDir` argument so the plugin cache key is per-project.
  - `resolveConnection` is synchronous (it never did async work).

  **`@ts-safeql/eslint-plugin`:**

  - When multiple plugins are configured, `onTarget` resolves to the first plugin returning a non-`undefined` result instead of the last. This matches the documented "defer to the next plugin" contract.

## 5.0.1

### Patch Changes

- 71d63b5: Fix TypeScript types failing to resolve in CommonJS projects.

## 5.0.0

### Major Changes

- 00b9904: BREAKING: Add ESLint 10 support to SafeQL.

### Minor Changes

- acd33af: Add experimental plugin API and AWS auth plugin

  - Experimental plugin system for extending SafeQL with custom behavior
  - First official plugin: `@ts-safeql/plugin-auth-aws` for AWS RDS IAM authentication
