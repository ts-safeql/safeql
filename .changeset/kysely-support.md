---
"@ts-safeql/plugin-kysely": minor
"@ts-safeql/plugin-utils": minor
"@ts-safeql/generate": minor
"@ts-safeql/eslint-plugin": minor
"@ts-safeql/connection-manager": patch
---

Add Kysely support via a new `@ts-safeql/plugin-kysely` plugin, plus the generic plugin
infrastructure that makes SafeQL library-agnostic.

**Kysely plugin**

- Validates Kysely's `sql` template tag (`` sql<T>`...` ``) and its helpers (`sql.ref`, `sql.val`,
  `sql.id`, `sql.table`, `sql.lit`, `sql.raw`, `sql.join`, nested fragments).
- **Builder mode** (opt-in, `kysely({ builder: true })`): lints the **raw `sql` fragments embedded
  in a fluent builder chain** (`` .select(sql`...`.as()) ``, `` .where(sql`...`) ``). SafeQL compiles
  the whole chain through its fragments and validates the resulting SQL against the database. Pure
  builder queries (no raw `sql`) are left to Kysely's own types; chains whose embedded sql isn't
  statically reconstructible (dynamic identifiers, callbacks) are skipped rather than guessed.
- **Schema-drift validation** via the new `check-schema` rule: diffs a Kysely `Database` interface
  against the live database (unwrapping `Generated`/`ColumnType`/`JSONColumnType`, honoring
  `fieldTransform`).
- Builds the shadow database directly from Kysely TypeScript migrations.

**Generic plugin API (`@ts-safeql/plugin-utils`)**

- `migrate` — a library-agnostic migration runner for `migrationsDir` connections (replaces the
  built-in `.sql` runner per-plugin; existing `.sql` migrations are unchanged).
- `resolveQuery` + `queryNodeKinds` — validate non-tag query nodes (e.g. builder `CallExpression`s);
  the plugin produces the SQL itself, keeping the core seam at `{ kind: "sql"; text }`.
- `resolveSchemaType` — locate + interpret a library schema type for `check-schema`.

`@ts-safeql/generate` now exports `introspectSchema` (DB columns → the same `ResolvedTarget`s as
query validation, scoped to non-system schemas), and `@ts-safeql/eslint-plugin` adds the
`check-schema` rule and a worker schema-introspection endpoint.
