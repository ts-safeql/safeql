---
"@ts-safeql/eslint-plugin": minor
"@ts-safeql/generate": minor
---

You can now modify the expected type for each table column. This could be useful when dealing with
dynamic types such as JSONB or when you want to enforce a specific type for a column.

```json
{
  // ...,
  "overrides": {
    "columns": {
      "table_name.column_name": "CustomType"
    }
  }
}
```

You can read more about it in the [documentation](https://safeql.dev/api/#connections-overrides-columns-optional)
