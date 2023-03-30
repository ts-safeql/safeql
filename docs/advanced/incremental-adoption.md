---
layout: doc
---

# Incremental adoption

SafeQL is designed to be easily adopted into your codebase, allowing for incremental implementation. This means that you can begin using SafeQL in a single query and gradually expand its use to more queries over time. This approach is particularly helpful for those with large codebases as it allows for a smooth transition to typed queries without refactoring existing code. At any point, you are free to opt-out of SafeQL without any restrictions or limitations.

---

::: info Example
This example uses [Prisma](https://www.prisma.io/), but the same approach can be applied to any library that allows raw queries.
:::

```ts
// db.ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
export const $typedQueryRaw = prisma.$queryRaw; // [!code ++]
```

```json
// `.eslintrc.json` (or any other ESLint config file):
{
  "rules": {
    "@ts-safeql/check-sql": [
      "error",
      {
        "connections": {
          "migrationsDir": "./prisma/migrations",
          "tagName": "$typedQueryRaw",
          "transform": "{type}[]"
        }
      }
    ]
  }
}
```

In runtime, `$typedQueryRaw` will be the same as `prisma.$queryRaw` without any differences. However, when you run ESLint, SafeQL will look for all the usages of `$typedQueryRaw` and validate them against the database schema. If any of the queries are invalid, ESLint will report an error.