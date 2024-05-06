---
layout: doc
---

# SafeQL :sparkles: node-postgres

SafeQL is compatible with [node-postgres](https://node-postgres.com/) which is the most popular postgres library in the ecosystem!

::: info PLEASE NOTE
node-postgres doesn't come with a built-in SQL template tag (` sql`` `).

Thus, you'll need to install [@ts-safeql/sql-tag](/libraries/sql-tag/introduction.html) in order to use SafeQL with node-postgres.

---

If you prefer using a different SQL template tag library, that's fine too!
see [sql-template-strings](https://www.npmjs.com/package/sql-template-strings) and [sql-template-tag](https://www.npmjs.com/package/sql-template-tag)
:::

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
      // this will lint syntax that matches "client.query(sql`...`)"
      { wrapper: "client.query" },
    ],
  })
);
```

== Legacy Config

1. Add `@ts-safeql/eslint-plugin` to your ESLint plugins:

```json
// .eslintrc.json

{
  "plugins": [..., "@ts-safeql/eslint-plugin"], // [!code highlight]
  // ...
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
              // this will lint syntax that matches "client.query(sql`...`)"
              { "wrapper": "client.query" }
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
import { Client } from "pg";

const client = new Client();

// Before
const query = client.query("SELECT idd FROM users");
                                   ~~~ Error: column "idd" does not exist // [!code error]

// After bug fix
const query = client.query("SELECT id FROM users");
              ~~~~~~~~~~~~ Error: Query is missing type annotation  // [!code error]

// After: ✅
const query = client.query(sql`SELECT id FROM users`);
```
