---
"@ts-safeql/eslint-plugin": patch
---

Allow importing safeql.config.ts in ESM project using the `format` property:

```json
{
  "rules": {
    "@ts-safeql/check-sql": [
      "error",
      {
        "useConfigFile": true,
        "format": "esm"
      }
    ]
  }
}
```
