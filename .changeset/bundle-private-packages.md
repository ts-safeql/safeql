---
"@ts-safeql/eslint-plugin": minor
"@ts-safeql/generate": minor
---

Smaller install: removed several `@ts-safeql/*` packages from runtime dependencies and inlined them into the published bundle.

If you use `@ts-safeql/generate` directly, install `libpg-query` alongside it — it's now a peer dependency.
