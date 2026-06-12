---
"@ts-safeql/eslint-plugin": patch
---

Fix a false "incorrect type annotation" error for columns whose names contain `", "`.

The type-equality check normalized ordering by re-sorting comma-separated fragments of the serialized type, which split such column names apart. Combined with a `transform` (e.g. `"{type}[]"`), this could report two identical shapes as a mismatch. The serialized form is already canonical, so the redundant pass was removed.
