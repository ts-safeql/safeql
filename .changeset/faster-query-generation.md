---
"@ts-safeql/generate": patch
---

Speed up query type generation. Queries that are linted repeatedly (watch mode, CI runs, or the same query reused across files) are now much faster, and per-query cost no longer grows with the size of your database schema.
