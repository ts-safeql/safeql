---
"@ts-safeql/eslint-plugin": minor
---

Support for `maxDepth` in `connections.targets` has been added, allowing deeper sql tag lookup when using `wrapper`:

```json
{
  "connections": {
    "targets": [
      {
        "wrapper": "conn.query",
        "maxDepth": 2
      }
    ]
  }
}
```

This handles nested queries like: ``conn.query(...sql`SELECT id FROM users`)``