---
"@ts-safeql/plugin-utils": patch
"@ts-safeql/generate": patch
"@ts-safeql/eslint-plugin": patch
---

Infer view columns built with `EXCEPT` and `INTERSECT` as non-nullable when PostgreSQL guarantees it: `EXCEPT` follows the left branch, and `INTERSECT` is non-null when either branch is. Plugins no longer read a destructuring default (`const { col = "id" } = options`) as a static value when the source value is unknown.
