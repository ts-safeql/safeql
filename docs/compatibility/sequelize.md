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

---

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

            // The name of the variable that holds the connection:
            "name": "sequelize",
            // An array of operators that wraps the raw query:
            "operators": ["query"]
          }
        ]
      }
    ]
  }
}
```

Lastly, SafeQL will be able to lint your queries like so:

<div class="error">

```typescript{7,11}
import { Sequelize } from "sequelize";

const sequelize = new Sequelize();

// Before
const query = sequelize.query("SELECT idd FROM users");
                                      ~~~ Error: column "idd" does not exist

// After bug fix
const query = sequelize.query("SELECT id FROM users");
              ~~~~~~~~~~~~~~~ Error: Query is missing type annotation

// After: ✅
const query = sequelize.query(sql`SELECT idd FROM users`);
```

</div>


