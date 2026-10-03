# @ts-safeql/zod-annotator

## 5.0.4

### Patch Changes

- Updated dependencies [09fcf97]
  - @ts-safeql/plugin-utils@5.3.0

## 5.0.3

### Patch Changes

- Updated dependencies [4aa9ca9]
  - @ts-safeql/plugin-utils@5.2.0

## 5.0.2

### Patch Changes

- 4568532: Publish the experimental Slonik plugin and tighten plugin resolution behavior.

  **`@ts-safeql/plugin-utils` (breaking for direct consumers of `PluginManager`):**

  - `resolveConnection`, `resolvePluginsSync`, `getCachedConnection`, and `evictPlugins` now require a `projectDir` argument so the plugin cache key is per-project.
  - `resolveConnection` is synchronous (it never did async work).

  **`@ts-safeql/eslint-plugin`:**

  - When multiple plugins are configured, `onTarget` resolves to the first plugin returning a non-`undefined` result instead of the last. This matches the documented "defer to the next plugin" contract.

- Updated dependencies [4568532]
  - @ts-safeql/plugin-utils@5.1.0

## 5.0.1

### Patch Changes

- 71d63b5: Fix TypeScript types failing to resolve in CommonJS projects.
- Updated dependencies [71d63b5]
  - @ts-safeql/plugin-utils@5.0.1

## 5.0.0

### Major Changes

- 00b9904: BREAKING: Add ESLint 10 support to SafeQL.

### Patch Changes

- Updated dependencies [00b9904]
- Updated dependencies [acd33af]
  - @ts-safeql/plugin-utils@5.0.0
