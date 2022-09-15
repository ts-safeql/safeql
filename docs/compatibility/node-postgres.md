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
            "name": "client",
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
const query = client.query(sql`SELECT * FROM users`);
```

Lastly, SafeQL will be able to lint your queries like so:

<div class="error">

```typescript{2}
const query = client.query(sql`SELECT idd FROM users`);
                                      ~~~ Error: column "idd" does not exist
```

</div>
