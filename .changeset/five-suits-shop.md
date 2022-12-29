---
"@ts-safeql/eslint-plugin": patch
---

This change introduce two improvements:

## Support union of the same type inside a query

Previously, this caused an error:
```ts
type UnionOfStrings = "A" | "B";
function run(sql: Sql, union: UnionOfStrings) {
  // ❌ Invalid Query: the type "UnionOfStrings" is not supported
  return sql`SELECT id FROM users WHERE name = ${union}`);
}
```

Now, this is supported:
```ts
type UnionOfStrings = "A" | "B";
function run(sql: Sql, union: UnionOfStrings) {
  // ✅ Valid Query
  return sql`SELECT id FROM users WHERE name = ${union}`);
}
```

Please note that this is only supported for unions of the same type. Meaning, this is still not supported:
```ts
type UnionOfMixedTypes = "A" | 1;
function run(sql: Sql, union: UnionOfMixedTypes) {
  // ❌ Invalid Query: Union types must be of the same type (found string, number)
  return sql`SELECT id FROM users WHERE name = ${union}`);
}
```

## Improved support for overriden types

Sometimes, we want to pass non-primitive types that are serializable (such as Date). Previously, this caused an error:
```ts
function run(sql: Sql, date: Date) {
  // ❌ Invalid Query: the type "Date" is not supported
  return sql`SELECT id FROM users WHERE name = ${date}`);

  // ⚠️ A workaround was to stringify the date:
  return sql`SELECT id FROM users WHERE name = ${date.toString()}`);
}
```

At first, this was by design. Since SafeQL didn't know what should `date` be. Is it a date, timestamp, or timestamptz?

Today, this is possible to do by configuring the [`overrides.types`](https://safeql.dev/api/index.html#connections-overrides-types-optional). SafeQL will check the type that is compared against, and use the correct type:

```json
{
  "overrides": {
    "types": {
      "Date": "timestamptz"
    }
  }
}
```

This will allow the following query to be valid:
```ts
function run(sql: Sql, date: Date) {
  return sql`SELECT id FROM users WHERE name = ${date}`);
  // ✅ Valid Query (The query will be evaulated as `SELECT id FROM users WHERE name = $1::timestamptz`)
}
```