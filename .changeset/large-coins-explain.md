---
"@ts-safeql/eslint-plugin": patch
"@ts-safeql/generate": patch
"@ts-safeql/shared": patch
---

you can now override the default types (e.g. timestamp -> DateTime) by adding an `overrides` property to the config:

```ts
// safeql.config.ts
import { definedConfig } from "@ts-safeql/eslint-plugin";

export default definedConfig({
  // ...
  overrides: {
    types: {
      timestamp: "DateTime",
    },
  },
});
```

or

```json
// .eslintrc.json
{
  // ...
  "connections": {
    // ...,
    "overrides": {
      "types": {
        "timestamp": "DateTime"
      }
    }
  }
}
```
