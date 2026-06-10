---
"@ts-safeql/eslint-plugin": patch
---

Resolve template-literal types (and branded `Money`) to `text` when used as query parameters.

A template-literal type such as `` `${number}` `` or `` `${string}` `` is a string at runtime but had no corresponding PostgreSQL type, so passing one as a parameter required a manual cast or an `overrides.types` entry. `checkType` now maps any template-literal type to `text` (and an array of them to `text[]`), mirroring how a plain `string` is handled. This also fixes branded `Money` (`` `${number}` & { __brand: "Money" } ``): the intersection branch resolves each member through `checkType`, and the `` `${number}` `` base now resolves to `text`, so the whole intersection maps to `text` with no change to the intersection helper. Intrinsic string-mapping types (`Uppercase<string>`, etc.) resolve to `text` as well, and an explicit `overrides.types` entry still takes precedence. Passing a template-literal value where an incompatible column type is expected is still reported, and a template-literal intersected with a conflicting base type (e.g. `` `${number}` `` & Date) is rejected.
