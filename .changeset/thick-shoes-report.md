---
"@ts-safeql/eslint-plugin": patch
"@ts-safeql/generate": patch
---

when returning an array column, return an array type instead of identifer (e.g instead of `Array<type>` return `type[]`).
