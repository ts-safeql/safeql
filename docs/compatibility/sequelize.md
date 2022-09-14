---
layout: doc
---

# SafeQL :muscle: Sequelize

SafeQL is compatible with [Sequelize](https://sequelize.org/) which [supports raw queries](https://sequelize.org/master/manual/raw-queries.html) as well!

::: info Please note
Sequlize doesn't come with a built-in SQL template tag (e.g., sql\`\`).
You can either use an existing one, such as
 - [sql-template-strings](https://www.npmjs.com/package/sql-template-strings)
 - [sql-template-tag](https://www.npmjs.com/package/sql-template-tag)
 - or you can write one yourself.
:::

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

Lastly, you'll be able to write queries like this:

```typescript
const query = sequelize.query(sql`SELECT * FROM users`);
```

Lastly, SafeQL will be able to lint your queries like so:

<div class="error">

```typescript{2}
const query = sequelize.query(sql`SELECT idd FROM users`);
                                         ~~~ Error: column "idd" does not exist
```

</div>
