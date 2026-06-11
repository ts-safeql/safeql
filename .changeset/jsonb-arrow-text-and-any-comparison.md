---
"@ts-safeql/generate": patch
"@ts-safeql/eslint-plugin": patch
---

Fix two JSON-related typing edge cases in SafeQL:

- In `@ts-safeql/generate`, infer `->>` and `#>>` as `text` even when the left side type is not fully known, preventing generated `unknown` types inside JSON object/array expressions.
- In `@ts-safeql/eslint-plugin`, treat `any` as a wildcard during expected/generated comparison so JSON columns typed as `any` no longer produce false mismatches against concrete annotations.
