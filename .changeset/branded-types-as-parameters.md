---
"@ts-safeql/eslint-plugin": patch
---

Resolve branded types to their base type when used as query parameters.

A branded type such as `string & { __brand: "ID" }` is a TypeScript intersection of a base primitive and one or more marker objects. Previously it had no corresponding PostgreSQL type, so passing one as a parameter forced a manual `as string` cast or an `overrides.types` entry. The intersection's base primitive is now used (the marker objects exist only in TypeScript), so branded values map to their underlying type automatically. This also covers arrays (`ID[]`) and nullable unions (`ID | null`). Passing a branded value against an incompatible column is still reported.
