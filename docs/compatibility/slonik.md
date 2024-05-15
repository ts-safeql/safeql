---
layout: doc
---

# SafeQL :heart: Slonik

SafeQL is compatible with [Slonik](https://github.com/gajus/slonik) as well with a few setting tweaks.

::: tabs key:eslintrc

== Flat Config

```js
// eslint.config.js

import safeql from "@ts-safeql/eslint-plugin/config";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ...
  safeql.configs.connections({
    // ... (read more about configuration in the API docs)
    targets: [
      {
        // This will lint syntax that matches "sql.type`...`" or "sql.unsafe`...`"
        tag: "sql.+(type(*)|unsafe)",
        // this will tell SafeQL to not suggest type annotations
        // since we will be using our Zod schemas in slonik
        skipTypeAnnotations: true,
      },
    ],
  })
);
```

== Legacy Config

1. Add `@ts-safeql/eslint-plugin` to your ESLint plugins:

```json{3}
// .eslintrc.json

{
  "plugins": [..., "@ts-safeql/eslint-plugin"],
  ...
}
```

2. Add `@ts-safeql/check-sql` to your rules and set the `connections` option:

```json
// .eslintrc.json

{
  // ...
  "rules": {
    // ...
    "@ts-safeql/check-sql": [
      "error",
      {
        "connections": [
          {
            // ... (read more about configuration in the API docs)
            "targets": [
              {
                // This will lint syntax that matches
                // "sql.type`...`" or "sql.unsafe`...`"
                "tag": "sql.+(type\\(*\\)|unsafe)",
                // this will tell safeql to not suggest type annotations
                // since we will be using our Zod schemas in slonik
                "skipTypeAnnotations": true
              }
            ]
          }
        ]
      }
    ]
  }
}
```

Once you've set up your configuration, you can start linting your queries:

```typescript
import { z } from 'zod';
import { sql } from 'slonik';

// Before:
const query = sql.type(z.object({ id: z.number() }))`SELECT idd FROM users`;
                    ~~~ Error: column "idd" does not exist // [!code error]

// After: ✅
const query = sql.type(z.object({ id: z.number() }))`SELECT id FROM users`;
```
