---
layout: doc
---

# SafeQL :heart: Prisma

SafeQL is compatible with [Prisma](https://www.prisma.io/) which [supports raw queries](https://www.prisma.io/docs/concepts/components/prisma-client/raw-database-access) as well, and very straightforward to use!

::: tip DEMO
Check out [@ts-safeql-demos/prisma](https://github.com/ts-safeql/safeql/tree/main/demos/prisma) for a working example.
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
            "migrationsDir": "./prisma/migrations",
            // The name of the variable that holds the connection:
            "name": "prisma",
            // An array of operators that wraps the raw query:
            "operators": ["$queryRaw"],
            // Transform the query result to array
            "transform": "{type}[]"
          }
        ]
      }
    ]
  }
}
```

Lastly, SafeQL will be able to lint your queries like so:

<div class="error">

```typescript{8,13}
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Before:
const query = prisma.$queryRaw(
  Prisma.sql`SELECT idd FROM users`
                    ~~~ Error: column "idd" does not exist
)

// After bug fix:
const query = prisma.$queryRaw(
              ~~~~~~~~~~~~~~~~ Error: Query is missing type annotation
  Prisma.sql`SELECT id FROM users`
)

// After: ✅
const query = prisma.$queryRaw<{ id: number; }[]>(
  Prisma.sql`SELECT id FROM users`
)
```

</div>
