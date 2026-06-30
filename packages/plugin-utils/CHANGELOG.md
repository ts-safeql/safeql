# @ts-safeql/plugin-utils

## 5.3.0

### Minor Changes

- 09fcf97: Validate the `<T>` annotation on raw `sql` fragments embedded in Kysely query-builder chains.

  SafeQL now checks that annotation against the type the database returns and autofixes it on a mismatch. A selection like ``sql<number>`name || bio`.as("credit_line")`` whose column is `string` gets flagged; a ``.where(sql<number>`bio is not null`)`` condition gets corrected to `boolean`. Conditions accept both `SqlBool` and `boolean`, and fragments wrapped in parentheses or `as` are checked like bare ones.

## 5.2.0

### Minor Changes

- 4aa9ca9: Add `@ts-safeql/plugin-kysely`, a first-class Kysely integration for SafeQL.

  The plugin validates Kysely raw `sql` templates and, when `kysely({ builder: true })` is enabled,
  raw SQL fragments inside Kysely query-builder chains. Pure Kysely builder queries stay covered by
  Kysely's own types; SafeQL focuses on the raw SQL it can reconstruct statically.

  Kysely TypeScript migrations can now build the shadow database used during validation, so SafeQL
  checks your queries against the schema your migrations actually produce — no separate database
  setup required.

  The shared plugin API now supports custom migration runners and non-template query resolution.
  Those hooks keep the ESLint rule generic while letting plugins teach SafeQL how each SQL library
  represents queries.

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
