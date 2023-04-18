---
layout: doc
---

# SafeQL :handshake: Postgres.js

SafeQL is compatible with [Postgres.js](https://github.com/porsager/postgres). In fact, SafeQL is built on top of Postgres.js!

First, Make sure you've added `@ts-safeql/eslint-plugin` to your ESLint plugins:

```json{3}
// .eslintrc.json
{
  "plugins": [..., "@ts-safeql/eslint-plugin"],
  ...
}
```

Second, add the following rule to your ESLint config:

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
            // ...

            "targets": [
              {
                // The name of the sql tag that should be checked:
                "tag": "sql",
                // Postgres.js type should be an array, so we add an extra "[]" after the generated type:
                "transform": "{type}[]"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

Lastly, SafeQL will be able to lint your queries like so:

<div class="error">

```typescript{6,10}
import { sql } from "postgres";
import { myClient } from "./myClient"; // Read the note above

// Before:
const query = sql`SELECT idd FROM users`
                         ~~~ Error: column "idd" does not exist

// After bug fix:
const query = sql`SELECT id FROM users`
              ~~~ Error: Query is missing type annotation

// After: ✅
const query = sql<{ id: number; }[]>`SELECT id FROM users`
```

</div>
