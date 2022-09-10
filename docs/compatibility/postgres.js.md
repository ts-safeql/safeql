---
layout: doc
---

# SafeQL :handshake: Postgres.js

SafeQL is compatible with [Postgres.js](https://github.com/porsager/postgres). In fact, SafeQL is built on top of Postgres.js!

::: info Before we begin

SafeQL supports by design only the following pattern:

```
variable.method(sql``).
```

Thus, we will need to write a small wrapper around Postgres.js':

```ts
import postgres, { RowList } from "postgres";

function createClient() {
  async function query<T>(query: postgres.PendingQuery<postgres.Row[]>) {
    const results = await query;

    return results as RowList<T[]>;
  }

  return { query };
}

export const myClient = createClient();
```

I would recommend using a more robust `createClient` function, but for simplicity's sake, we'll use this one.

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
            // The migrations path:
            "migrationsDir": "./your_migrations_folder_path",
            // A shadow database name (see explanation in Configuration):
            "databaseName": "my_db_shadow",
            // The name of the variable that holds the connection:
            "name": "myClient",
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

```typescript{5}
import { sql } from "postgres";
import { myClient } from "./myClient"; // Read the note above

const query = myClient.query(sql`SELECT idd FROM users`);
                                        ~~~ Error: column "idd" does not exist
```

</div>