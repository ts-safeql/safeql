# Extending SafeQL to other query libraries

SafeQL's analysis is **library-agnostic**. Everything library-specific lives in a
plugin; the SafeQL core only ever consumes a small, stable seam:

> a plugin turns a node of user code into **`{ kind: "sql"; text }`**, and SafeQL
> validates that SQL against the (shadow) database.

Nothing about Kysely, Drizzle, Prisma, or TypeORM is baked into the core. Building
Kysely support proved it: **embedded-sql validation** (`resolveQuery`) compiles a builder
chain — through the raw `sql` fragments embedded in it — to SQL **inside the Kysely plugin**
(its own `DummyDriver` sandbox) and hands SafeQL only the SQL text, with no change to the
core query seam.

This page maps the plugin hooks to each library so you can add a new one.

## The hooks

| Hook                              | Process        | Purpose                                                                                                                                              |
| --------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onTarget`                        | rule (checker) | Decide whether a `TaggedTemplateExpression` is a query to validate, a fragment to skip, or not ours.                                                 |
| `onExpression`                    | rule (checker) | Translate each `${…}` interpolation inside a matched tag to a SQL fragment (`$N`, an identifier, an inlined literal, …).                             |
| `resolveQuery` + `queryNodeKinds` | rule (checker) | Validate non-tag nodes (e.g. fluent builder `CallExpression`s). The plugin produces the SQL itself (statically, or by compiling in its own sandbox). |
| `migrate`                         | worker         | Build the shadow database from the project's migrations (TS migrations, a CLI, …) instead of the built-in `.sql` runner.                             |
| `createConnection`                | worker         | Provide a custom database connection.                                                                                                                |

Rule-only hooks (`onTarget`, `onExpression`, `resolveQuery`) run in
the ESLint process and may use the TypeScript checker. Worker hooks (`migrate`,
`createConnection`) run in the synckit worker and must never receive checker-bound values.

## Drizzle (`@ts-safeql/plugin-drizzle`)

Validates Drizzle's `sql` template tag (`import { sql } from "drizzle-orm"`):

- `onTarget` — recognises the `drizzle-orm` `sql` symbol and validates a tag when it is a
  standalone query (incl. `db.execute(sql\`…\`)`); a tag passed to a fragment method
(`.where`, `.having`, `.orderBy`, …) or used via `.as()` is skipped.
- `onExpression` — `sql.raw(static)` is inlined, `sql.identifier(static)` is quoted,
  `sql.placeholder()` and plain **primitive** interpolations become bound params, nested
  `sql` fragments recurse. A non-primitive interpolation (a Drizzle column/table object,
  whose SQL can't be reconstructed statically) skips the query rather than guessing.

Drizzle's fluent builder (`db.select().from(…)`) is out of scope; it would follow the
same `resolveQuery` pattern as Kysely's builder support, compiling via Drizzle's own
`.toSQL()` instead of Kysely's `DummyDriver`.

## Prisma

Prisma's raw queries are tagged templates from `@prisma/client`
(`prisma.$queryRaw\`…\``, with `Prisma.sql`/`Prisma.raw`/`Prisma.join`helpers) — the
same shape as Drizzle/Kysely`sql`tags. A Prisma plugin implements`onTarget`(recognise the`$queryRaw`/`$executeRaw`tag) and`onExpression`(translate the`Prisma.\*`
helpers), reusing this page's pattern verbatim.

## TypeORM

TypeORM already exercises the **generic migration abstraction**: a TypeORM plugin
implements only the `migrate` hook to run TypeORM TS migrations against the shadow
database (exactly as the Kysely plugin runs Kysely migrations). Its `EntityManager.query`
takes a plain SQL **string** rather than a tag, so a TypeORM plugin would claim the `query`
call by declaring a `CallExpression` query selector and validate it with `resolveQuery`
rather than `onTarget`. Routing the call is straightforward; validating a plain-string
argument — type annotations, `$1` parameters, dynamically-assembled text — is a separate
concern left to the plugin.

## Summary

Adding a library is "implement the hooks for that library", never "change SafeQL". The
core seam — `{ kind: "sql"; text }` plus DB introspection — is shared by every plugin.
