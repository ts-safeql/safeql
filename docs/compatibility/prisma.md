---
layout: doc
---

# SafeQL :heart: Prisma

SafeQL is compatible with [Prisma](https://www.prisma.io/) which [supports raw queries](https://www.prisma.io/docs/concepts/components/prisma-client/raw-database-access) as well, and it's really easy to use!

First, Make sure you've added `@ts-safeql/eslint-plugin` to your ESLint plugins:

```json{2}
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
            // A shadow database name (see explanation in Configuration):
            "databaseName": "my_db_shadow",
            // The name of the variable that holds the connection:
            "name": "prisma",
            // An array of operators that wraps the raw query:
            "operators": ["$queryRaw"]
          }
        ]
      }
    ]
  }
}
```

Lastly, you'll be able to write queries like this:

```typescript
const query = prisma.$queryRaw(sql`SELECT * FROM users`);
```
