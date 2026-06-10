---
"@ts-safeql/generate": minor
---

Infer `NOT NULL` for columns selected from views and materialized views.

PostgreSQL does not propagate `NOT NULL` constraints through views — every view column reports as nullable in the catalog — so SafeQL previously typed every view column as `T | null`. SafeQL now looks *through* a view's definition: it fetches the view body via `pg_get_viewdef`, resolves each output column with the same inference used for regular queries, and upgrades a column to non-null only when its definition provably guarantees it.

This covers column passthrough from `NOT NULL` base columns (including through inner joins, while the nullable side of an outer join stays nullable), aliased and qualified references, nested views (view-on-view), materialized views, expression columns such as `count(*)`, `coalesce(x, 'fallback')`, `a || b` over `NOT NULL` columns, and `CASE`, and set-operation views (`UNION`/`INTERSECT`/`EXCEPT`) where a column is treated as non-null only when every branch proves it non-null. Anything that can't be proven (function-backed system views, definitions that don't parse) keeps the conservative nullable default, so the change never produces an unsound `NOT NULL`.
