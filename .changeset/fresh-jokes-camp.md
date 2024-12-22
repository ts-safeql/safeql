---
"@ts-safeql/eslint-plugin": minor
"@ts-safeql/generate": minor
---

Added support for literal inference. SafeQL will now be able to infer string literals from your queries:

```ts
// Before:
sql<{ col: string }>`SELECT ${"value"} FROM table`;
sql<{ col: string }>`SELECT CASE WHEN ${condition} THEN 'a' ELSE 'b' END`;

// After:
sql<{ col: "value" }>`SELECT ${"value"} FROM table`;
sql<{ col: "a" | "b" }>`SELECT CASE WHEN ${condition} THEN 'a' ELSE 'b' END`;
```

This behavior could be disabled or adjusted in the `connections.inferLiterals`.
