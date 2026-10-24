---
"@ts-safeql/generate": patch
"@ts-safeql/eslint-plugin": patch
---

Map PostgreSQL `name` values to strings, including catalog columns and function results. Preserve
`current_schema()` nullability because the search path may contain no existing schema.
