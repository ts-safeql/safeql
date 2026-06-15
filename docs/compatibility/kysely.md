---
layout: doc
---

# SafeQL :heart: Kysely

SafeQL is compatible with [Kysely](https://kysely.dev). It validates Kysely's
[`sql` template tag](https://kysely.dev/docs/recipes/raw-sql) against your real database, and
can build the shadow database directly from your Kysely (TypeScript) migrations.

::: warning EXPERIMENTAL
The Kysely plugin is experimental and may change in future releases.
:::

## Scope

SafeQL validates the **raw SQL** in your Kysely code, in two forms:

- **Default mode:** standalone raw `sql` tags (`` sql<T>`...` ``), including the Kysely `sql`
  expressions interpolated inside them (`sql.ref`, `sql.val`, `sql.lit`, `sql.join`, …).
- **Builder mode (`builder: true`):** the **partial raw `sql` fragments embedded in a fluent
  builder chain** — `` .select(sql`...`.as("x")) ``, `` .where(sql`...`) ``. SafeQL compiles the
  whole chain through those fragments and validates the resulting SQL against the database.

A *pure* builder query (no raw `sql`) is left to Kysely's own types — SafeQL doesn't re-check it.

## Installation

```bash
npm install -D @ts-safeql/plugin-kysely
```

The plugin uses your project's `kysely`. Running TypeScript migrations (`migrationsDir`)
additionally needs `pg` and `tsx` installed in your project — they're declared as optional peer
dependencies and only loaded when migrations run.

## Using the Kysely Plugin

```js
// eslint.config.js
import safeql from "@ts-safeql/eslint-plugin/config";
import kysely from "@ts-safeql/plugin-kysely";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ...
  safeql.configs.connections({
    databaseUrl: "postgres://user:pass@localhost:5432/db",
    plugins: [kysely()],
  }),
);
```

The plugin decides on its own which `sql` tags are real queries. Only standalone queries are
validated; fragments (see below) are skipped.

```typescript
import { sql } from "kysely";

// Validated against the database; the result row type is checked against <T>.
const rows = await sql<{ id: number; name: string }>`SELECT id, name FROM person`.execute(db);

// Wrong type → reported (and auto-fixed with `--fix`)
const bad = await sql<{ id: string }>`SELECT id FROM person`.execute(db);
//                       ~~~~~~~~~~
// Error: Incorrect type annotation. Expected: { id: number }
```

## Builder mode — linting embedded raw `sql` (opt-in)

Enable `builder: true` to also lint the raw `sql` fragments you embed inside fluent builder
chains. SafeQL compiles the whole chain (through the fragments) and validates the resulting SQL.

```js
// eslint.config.js
import safeql from "@ts-safeql/eslint-plugin/config";
import kysely from "@ts-safeql/plugin-kysely";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ...
  safeql.configs.connections({
    databaseUrl: "postgres://user:pass@localhost:5432/db",
    plugins: [kysely({ builder: true })],
  }),
);
```

```typescript
import { sql, type SqlBool } from "kysely";

// The embedded raw sql is validated against the schema:
db.selectFrom("person").select(sql<string>`upper(first_name)`.as("shout")).execute();
db.selectFrom("person").select("id").where(sql<SqlBool>`bio is not null`).execute();

// Caught — the embedded raw sql references a column that doesn't exist:
db.selectFrom("person").select(sql<string>`upper(nonexistent)`.as("x")).execute();
//                                          ~~~~~~~~~~~~~~~~~~~ column "nonexistent" does not exist

// A pure builder query (no raw sql) is left to Kysely's own types — not re-checked here.
db.selectFrom("person").select("id").execute();
```

Chains whose embedded sql isn't statically reconstructible (a dynamic identifier via
`sql.ref(someVar)`, a `select((eb) => …)` callback, a runtime-built fragment) are skipped rather
than guessed. Runtime values interpolated into a fragment (`` sql`id > ${x}` ``) are validated as
bound parameters.

## Building the database from Kysely migrations

Instead of pointing SafeQL at a live database, you can let it build a throwaway **shadow
database** from your Kysely migrations. The plugin runs your TypeScript migration files (via
[`Migrator`](https://kysely.dev/docs/migrations)) before validating queries:

```js
// eslint.config.js
import safeql from "@ts-safeql/eslint-plugin/config";
import kysely from "@ts-safeql/plugin-kysely";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ...
  safeql.configs.connections({
    migrationsDir: "migrations", // your Kysely migration files (up/down)
    plugins: [kysely()],
  }),
);
```

```typescript
// migrations/0001_init.ts
import { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("person")
    .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("name", "text", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("person").execute();
}
```

Migrations run in alpha-numeric filename order. TypeScript migration files are loaded directly —
no build step required.

## CamelCasePlugin

If you use Kysely's `CamelCasePlugin` (camelCase in TypeScript, snake_case in the database), tell
SafeQL to camelCase the inferred column names with a `fieldTransform` target:

```js
safeql.configs.connections({
  databaseUrl: "postgres://user:pass@localhost:5432/db",
  plugins: [kysely()],
  targets: [{ tag: "sql", fieldTransform: "camel" }],
});
```

```typescript
// first_name (DB) → firstName (TypeScript)
const rows = await sql<{ firstName: string }>`SELECT first_name FROM person`.execute(db);
```

## Generating the `Database` interface

SafeQL checks the `<T>` you write against the real result; it doesn't generate Kysely's
`Database` type. To keep that type in sync with your schema, use
[kysely-codegen](https://github.com/RobinBlomberg/kysely-codegen) or another generator from
[Kysely's "Generating types" docs](https://kysely.dev/docs/generating-types).

## Schema-drift validation (`check-schema`, opt-in)

The separate `check-schema` rule diffs your hand-written Kysely `Database` interface against
the live (shadow) database, so a type that has drifted from the schema is caught at lint time.
Enable the rule and point it at your `Database` type:

```js
// eslint.config.js
import safeql from "@ts-safeql/eslint-plugin/config";

export default [
  safeql.configs.connections({
    migrationsDir: "./migrations",
    plugins: [kysely()],
    // Verify this interface against the database:
    schema: { type: "Database", fieldTransform: "camel" },
  }),
];
```

```ts
interface Database {
  person: {
    id: Generated<number>;
    firstName: string;
    bio: string; // ← error: the column is nullable in the database (`string | null`)
    nickname: string; // ← error: column does not exist in the database
  };
  // ← error: `bio` exists in the database but is missing here (when omitted)
}
```

`check-schema`:

- unwraps Kysely's `Generated<T>` / `ColumnType<S, …>` / `JSONColumnType<T>` to the **select** type,
- maps DB columns to your property names via `fieldTransform` (required for a camelCase type over a
  snake_case database),
- reports columns that are typed but missing from the DB, columns in the DB but missing from the type,
  type/nullability mismatches, and typed tables that don't exist.

It reuses the exact same type comparison as the query check, so the verdicts are consistent.

## Support Matrix

Legend: `✅` supported, `⚠️` partial support, `❌` unsupported.

| Library syntax                                               | Support | Notes                                                                        |
| ------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------- |
| `` sql<T>`...` `` (standalone / `.execute()` / `.compile()`) | ✅      | Validated as a query; row type checked against `<T>`                         |
| `sql.val(...)` / plain `${value}`                            | ✅      | Bound parameter                                                              |
| `sql.ref(...)`, `sql.id(...)`, `sql.table(...)`              | ✅      | Inlined as quoted identifiers (static values only)                           |
| `sql.lit(...)`                                               | ✅      | Inlined as a SQL literal                                                     |
| `sql.raw(...)`                                               | ⚠️      | Inlined when the argument is a static string; otherwise the query is skipped |
| `sql.join([...])`                                            | ✅      | Expanded to positional placeholders (static arrays)                          |
| Nested/embedded `` sql`...` `` fragments                     | ✅      | Inlined into the outer query                                                 |
| ``sql`...`.as("alias")`` (selection fragment)                | ⚠️      | Intentionally skipped — not a standalone query                               |
| Raw `sql` embedded in a builder (`.select(sql`…`.as())`, `.where(sql`…`)`) | ⚠️ | Opt-in with `builder: true`; the chain is compiled through its fragments and the SQL validated |
| Pure fluent builder (no raw `sql`)                            | ➖      | Not re-checked — left to Kysely's own types                                            |
| `Database` schema-drift check                                 | ⚠️      | Opt-in via the `check-schema` rule + `schema: { type }`; in-file `Database` type      |
