---
"@ts-safeql/generate": patch
---

Fix inferred TypeScript return types for scalar subqueries when the inner select always returns one row (e.g. `count(*)` without `GROUP BY` → `string` instead of `string | null` for int8). Detect aggregates from the database catalog. Also fix inference for empty array literals, typed array casts, and joins with set-returning functions.
