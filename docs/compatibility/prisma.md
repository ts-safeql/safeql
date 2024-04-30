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
            "targets": [
              {
                // The sql tags that should be checked.
                // either `db.$queryRaw` or `db.$executeRaw`:
                "tag": "prisma.+($queryRaw|$executeRaw)",
                // Transform the query result to array
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

```typescript
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Before:
const query = prisma.$queryRaw`SELECT idd FROM users`;
                    ~~~ Error: column "idd" does not exist // [!code error]

// After bug fix:
const query = prisma.$queryRaw`SELECT id FROM users`;
              ~~~~~~~~~~~~~~~~ Error: Query is missing type annotation // [!code error]

// After: ✅
const query = prisma.$queryRaw<{ id: number; }[]>`SELECT id FROM users`;
```