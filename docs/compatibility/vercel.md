---
layout: doc
---

# SafeQL :heart: @vercel/postgres

SafeQL supports [@vercel/postgres](https://vercel.com/docs/storage/vercel-postgres) out of the box.

::: tip DEMO
Check out [@ts-safeql-demos/vercel-postgres](https://github.com/ts-safeql/safeql/tree/main/demos/vercel-postgres) for a working example.
:::

1. Add `@ts-safeql/eslint-plugin` into your ESLint plugins and configure the rule it with [`useConfigFile`](/api/#useconfigfile):

```json{5,8}
// .eslintrc.json
{
  "plugins": [
    // ...
    "@ts-safeql/eslint-plugin"
  ],
  "rules": {
    "@ts-safeql/check-sql": ["error", { "useConfigFile": true }]
  }
}
```

2. Create a file called safeql.config.ts:

::: info
This example uses the development `DATABASE_URL` environment variable, but you can configure it according to your needs.
:::

```ts
// safeql.config.ts
import { defineConfig } from "@ts-safeql/eslint-plugin";
import dotenv from "dotenv";

dotenv.config({ path: ".env.development.local" });

export default defineConfig({
  connections: {
    databaseUrl: process.env.POSTGRES_URL,
    targets: [{ tag: "?(client.)sql" }],
  },
});
```

3. Lint your queries with SafeQL:

```typescript
import { db, sql } from "@vercel/postgres";

// Before:
const query = client.sql`SELECT idd FROM users`;
                     ~~~ Error: column "idd" does not exist // [!code error]

// After bug fix:
const query = client.sql`SELECT id FROM users`;
              ~~~~~~~~~~ Error: Query is missing type annotation // [!code error]

// ✅ After:
const query = client.sql<{ id: number; }>`SELECT id FROM users`;

// ✅ Vercel's sql tag is also supported:
const query = sql<{ id: number; }>`SELECT id FROM users`;
```