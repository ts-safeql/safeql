---
layout: doc
---

# SafeQL :handshake: Postgres.js

SafeQL is compatible with [Postgres.js](https://github.com/porsager/postgres). SafeQL is built on top of Postgres.js!

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
      // this will lint syntax that matches "sql`...`"
      { tag: "sql", transform: "{type}[]" }
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
              // this will lint syntax that matches "sql`...`"
              { "tag": "sql", "transform": "{type}[]" }
            ]
          }
        ]
      }
    ]
  }
}
```

:::

Once you've set up your configuration, you can start linting your queries:

```typescript
import { sql } from "postgres";
import { myClient } from "./myClient"; // Read the note above

// Before:
const query = sql`SELECT idd FROM users`
                         ~~~ Error: column "idd" does not exist // [!code error]

// After bug fix:
const query = sql`SELECT id FROM users`
              ~~~ Error: Query is missing type annotation // [!code error]

// After: ✅
const query = sql<{ id: number; }[]>`SELECT id FROM users`
```
