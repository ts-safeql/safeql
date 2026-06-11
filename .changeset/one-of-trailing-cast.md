---
"@ts-safeql/eslint-plugin": patch
---

Skip the `one-of` `IN (...)` rewrite when the parameter carries a trailing cast.

A string-literal-union or enum parameter compared with `=` (e.g. `WHERE role = ${cert}`) is rewritten to `role IN ('owner', 'admin')` so the column is validated against every value. When the parameter carries a trailing cast — `WHERE role = ${cert}::role`, which is required when the column is a real PostgreSQL enum/domain — the cast was applied to the boolean `IN` result, producing `cannot cast type boolean to role` and forcing a manual `String(...)` widening. The rewrite is now skipped when the parameter is immediately followed by a `::cast`, falling through to the `$n::cast` placeholder (the same path already used in non-equality contexts like `${cert}::role IS NULL`), which composes with the trailing cast correctly.
