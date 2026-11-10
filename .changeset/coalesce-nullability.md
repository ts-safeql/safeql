---
"@ts-safeql/generate": patch
---

Infer `COALESCE` as nullable unless at least one argument is non-nullable, matching PostgreSQL semantics.
