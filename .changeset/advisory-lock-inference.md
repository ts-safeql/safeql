---
"@ts-safeql/generate": patch
"@ts-safeql/eslint-plugin": patch
---

Recover unresolved scalar result types from PostgreSQL's existing query description. Infer advisory
try-lock results as nonnull only when their key arguments are proven nonnull; nullable arguments
retain nullability, including keys produced by hash functions.
