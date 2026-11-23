---
"@ts-safeql/eslint-plugin": patch
---

The `configs.useConfigFile` and `configs.connections()` helpers are now typed with ESLint's own config type, so they work inside ESLint's `defineConfig()` without type errors.

The helper types come from ESLint's own type declarations, which ESLint ships from 9.10 on. On an older ESLint 9, install `@types/eslint` to get them.
