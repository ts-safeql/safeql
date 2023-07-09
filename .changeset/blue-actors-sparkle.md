---
"@ts-safeql/eslint-plugin": major
"@ts-safeql/generate": major
---

# Enhanced Nullability Checks

Previously, SafeQL adopted an optimistic standpoint, presuming a returned column to be non-nullable until established otherwise. Albeit this assumption worked fine in a majority of situations, it occasionally led to false positives. To illustrate, let's take a case of `SELECT max(col) FROM ...`. Previously, such a query returned a non-nullable column, disregarding that the `max` function could return `null` if the result set contained no rows (unlike other functions such as `count`).

```ts
// ❌ Previously, this would be considered non-nullable
const result = await sql<{ max: number }>`SELECT max(col) FROM tbl WHERE FALSE`;

// ✅ Now, this is considered nullable
const result = await sql<{ max: number | null }>`SELECT max(col) FROM tbl WHERE FALSE`;

// ✅✅ You could add a fallback via `coalesce` to make it non-nullable again
const result = await sql<{ max: number }>`SELECT coalesce(max(col), '0') FROM tbl WHERE FALSE`;
```

Moreover, the nullability checks for WHERE clauses have been enhanced.

```ts
// ❌ Previously, SafeQL annotated a nullable column as null,
// even though it was checked for nullability:
const result = await sql<{ text_nullable: string | null }>`
  SELECT text_nullable FROM tbl WHERE text_nullable IS NOT NULL
`;

// ✅ Now, SafeQL accurately annotates the column as non-nullable
const result = await sql<{ text_nullable: string }>`
  SELECT text_nullable FROM tbl WHERE text_nullable IS NOT NULL
`;
```
