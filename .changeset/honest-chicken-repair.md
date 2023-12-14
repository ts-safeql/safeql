---
"@ts-safeql/eslint-plugin": major
"@ts-safeql/generate": major
---

Significantly improved the validation and type-inference of JSON/B expressions (e.g., jsonb_agg, json_build_object).

Before:

```ts
sql<{ rows: any[] }>`
  SELECT jsonb_agg(json_build_object('id', id, 'name', name)) AS rows
`;
```

After:

```ts
sql<{ rows: { id: number; name: string }[] }>`
  SELECT jsonb_agg(json_build_object('id', id, 'name', name)) AS rows
`;
```
