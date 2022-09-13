---
"@ts-safeql/eslint-plugin": patch
---

type transformation is now possible.

For example:

```json
{
  // ...
  "connections": [
    {
      // ...
      "transform": "${type}[]"
    }
  ]
}
```

`${type}` will be replaced by the original type that was generated. In this case, we are transforming it into an array:

```ts
// before transformation
const rows = conn.query<{ id: number }>(conn.sql`SELECT id FROM users`)

// after transformation
const rows = conn.query<{ id: number }[]>(conn.sql`SELECT id FROM users`)
                                      ^^
```

transform accepts the following pattern: `string | (string | [(from) string, (to) string])[]`.

For example:
- `"transform": "${type}[]"` (add `[]` to the end)
- `"transform": ["${type}[]"]` (identical to the previous one)
- `"transform": [["Nullable", "Maybe"]]` (replaces `Nullable` with `Maybe`)
