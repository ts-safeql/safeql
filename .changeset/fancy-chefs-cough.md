---
"@ts-safeql/eslint-plugin": patch
"@ts-safeql/generate": patch
---

Fix inference for array of enums (it now expands to the enum's members instead of `unknown[]`).
