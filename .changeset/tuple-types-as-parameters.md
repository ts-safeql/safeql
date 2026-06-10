---
"@ts-safeql/eslint-plugin": patch
---

Resolve tuple types to their element type when used as query parameters.

A tuple such as `NonEmptyArray<T>` (`[T, ...T[]]`) has no corresponding PostgreSQL type, so passing one as a parameter forced a manual `as T[]` cast, a `[...spread]`, or an `overrides.types` entry. `checkType` now resolves each element type of a tuple and, when they agree, maps the tuple to that element type's array (`T[]`) — mirroring how a real array is handled. Element resolution recurses, so branded elements like `NonEmptyArray<ID>` still map to `text[]`. An empty tuple, an all-null tuple, or a heterogeneous tuple whose elements map to conflicting PostgreSQL types is rejected, and an explicit `overrides.types` entry still takes precedence.
