---
"@ts-safeql/eslint-plugin": patch
---

The `configs.useConfigFile` and `configs.connections()` helpers are now typed with ESLint's own config type, so they work inside ESLint's `defineConfig()` without type errors.
