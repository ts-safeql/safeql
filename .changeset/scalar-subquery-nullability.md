---
"@ts-safeql/generate": patch
---

Fix inferred TypeScript return types for scalar subqueries when the inner select always returns one row (e.g. `count()` without `GROUP BY` → `number` instead of `number | null`). Detect aggregates via `pg_proc.prokind`. Also fix inference for empty array literals, typed array casts, and joins with set-returning functions.
