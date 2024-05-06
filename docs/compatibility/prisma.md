---
layout: doc
---

# SafeQL :heart: Prisma

SafeQL is compatible with [Prisma](https://www.prisma.io/) which [supports raw queries](https://www.prisma.io/docs/concepts/components/prisma-client/raw-database-access) as well, and very straightforward to use!

::: tip DEMO
Check out [@ts-safeql-demos/prisma](https://github.com/ts-safeql/safeql/tree/main/demos/prisma) for a working example.
:::

:::tabs key:eslintrc
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
      // this will lint syntax that matches
      // `prisma.$queryRaw` or `prisma.$executeRaw`
      { tag: "prisma.+($queryRaw|$executeRaw)", transform: "{type}[]" },
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
              // `prisma.$queryRaw` or `prisma.$executeRaw`
              {
                "tag": "prisma.+($queryRaw|$executeRaw)",
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

:::

Once you've set up your configuration, you can start linting your queries:

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
