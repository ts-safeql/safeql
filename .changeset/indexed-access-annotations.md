---
"@ts-safeql/eslint-plugin": patch
---

Resolve indexed-access query annotations with TypeScript's type checker, so direct row and column
types such as `Database['members']` behave like their named aliases.
