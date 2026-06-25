---
"@ts-safeql/generate": patch
"@ts-safeql/eslint-plugin": patch
---

Fix SQL type inference for nullable booleans, CTEs, and subselects.

Nullable boolean expressions (for example `CASE WHEN … THEN col = 1 ELSE NULL END`) now infer `boolean | null` instead of being dropped. Columns selected through CTEs or subselects keep the nullability from their defining query, including after `LEFT JOIN`. Column references inside those scopes also resolve against the selected output name, not only an explicit alias.
