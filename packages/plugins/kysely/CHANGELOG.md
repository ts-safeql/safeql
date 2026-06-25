# @ts-safeql/plugin-kysely

## 0.1.0

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
