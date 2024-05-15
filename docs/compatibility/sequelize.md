---
layout: doc
---

# SafeQL :muscle: Sequelize

SafeQL is compatible with [Sequelize](https://sequelize.org/) which [supports raw queries](https://sequelize.org/master/manual/raw-queries.html) as well!

::: info PLEASE NOTE
Sequelize doesn't come with a built-in SQL template tag (` sql`` `).

Thus, you'll need to install [@ts-safeql/sql-tag](/libraries/sql-tag/introduction.html) in order to use SafeQL with Sequelize.

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
      // this will lint syntax that matches "sequelize.query(sql`...`)"
      { wrapper: "sequelize.query" },
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
              // this will lint syntax that matches
              // "sequelize.query(sql`...`)"
              { "wrapper": "sequelize.query" }
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
import { Sequelize } from "sequelize";

const sequelize = new Sequelize();

// Before
const query = sequelize.query("SELECT idd FROM users");
                                      ~~~ Error: column "idd" does not exist // [!code error]

// After bug fix
const query = sequelize.query("SELECT id FROM users");
              ~~~~~~~~~~~~~~~ Error: Query is missing type annotation // [!code error]

// After: ✅
const query = sequelize.query(sql`SELECT id FROM users`);
```
