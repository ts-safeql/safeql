---
"@ts-safeql/eslint-plugin": major
"@ts-safeql/generate": major
---

BREAKING: SafeQL now requires the latest minore releases of `libpg-query` which use WASM builds instead of native binaries. This change imporves compatibility across different platforms and eliminates native compilation issues.
