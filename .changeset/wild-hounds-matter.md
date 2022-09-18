---
"@ts-safeql/eslint-plugin": patch
---

- `connections` can now be a single connection object instead of an array of connections.
- by setting `{"useConfigFile": true }`, the plugin will use the `safeql.config.ts` file to get the connection/s information:

```json
// .eslintrc.json
{
  // ...
  "rules": {
    "@ts-safeql/check-sql": ["error", { "useConfigFile": true }]
  }
}
```

```typescript
// safeql.config.ts
import { defineConfig } from "@ts-safeql/eslint-plugin";

export default defineConfig({
  connections: {
    // ...
  },
});
```

By moving the configuration into a `.ts` file, we get full auto-completion, which should help configure the connections and find errors.

Please note that `safeql.config.ts` should be at the root of your project.
