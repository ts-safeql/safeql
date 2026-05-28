---
layout: doc
---

# SafeQL :handshake: Postgres.js

SafeQL is compatible with [Postgres.js](https://github.com/porsager/postgres) through `@ts-safeql/plugin-postgres-js`.

## Using the Postgres.js Plugin (Experimental)

::: warning EXPERIMENTAL
The Postgres.js plugin is experimental and may change in future releases.
:::

```bash
npm install @ts-safeql/plugin-postgres-js
```

```js
// eslint.config.js
import safeql from "@ts-safeql/eslint-plugin/config";
import postgresjs from "@ts-safeql/plugin-postgres-js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ...
  safeql.configs.connections({
    databaseUrl: "postgres://user:pass@localhost:5432/db",
    plugins: [postgresjs()],
  }),
);
```

Once configured, SafeQL will lint normal postgres.js queries and the helper forms the plugin understands:

```typescript
import postgres from "postgres";

const sql = postgres();

// Wrong column
const query = sql`SELECT idd FROM users`;
//                       ~~~ Error: column "idd" does not exist

// Missing type annotation
const fixedQuery = sql`SELECT id FROM users`;
//                 ~~~ Error: Query is missing type annotation

// Correct
const typedQuery = sql<{ id: number }[]>`SELECT id FROM users`;
```

### Support Matrix

Legend: `✅` supported, `⚠️` partial support, `❌` unsupported.

| Feature | Support | Notes |
| ------- | ------- | ----- |
| Tagged queries | ✅ | Plain `` sql`...` `` queries are validated normally, including type annotation suggestions and fixes |
| Query modifiers | ✅ | Query chains like `` sql`...`.values() ``, ``.raw()``, ``.describe()``, ``.execute()``, ``.cursor()``, and ``.forEach()`` are analyzed through the underlying tagged query |
| Identifier helpers | ✅ | `sql("users")`, `sql("id")`, `sql("name", "age")`, and `sql(["name", "age"])` are rewritten to escaped identifiers and column lists |
| Object helpers | ✅ | `sql(object)`, `sql(object, "name", "age")`, and `sql(object, ["name", "age"] as const)` are supported in common `INSERT` and `UPDATE` helper positions |
| Array and values helpers | ✅ | `sql(array)` works in common `IN (...)` and `VALUES (...)` forms, including 1D and matrix-style input |
| Multi-row insert helpers | ✅ | `sql(rows)` and `sql(rows, "name", "age")` are supported in common `INSERT` helper positions |
| Direct nested fragments | ✅ | Fragment variables and inline nested tags like `${where}` and `${sql\`...\`}` are inlined into the outer query |
| Typed helpers | ✅ | `sql.typed(...)` and `sql.typed.foo(...)` are treated as parameters |
| Unsafe SQL | ✅ | `sql.unsafe(...)` is inlined and checked when the SQL string is statically known |
| Direct ordering fragments | ✅ | Direct fragments like `ORDER BY ${sql\`age DESC\`}` are supported |
| Copy stream queries | ✅ | Copy forms like `` sql`COPY ... FROM STDIN`.writable() `` and `` sql`COPY ... TO STDOUT`.readable() `` are validated through the underlying tagged query |
| Conditional fragment selection | ❌ | Examples: ternary fragments, inline dynamic filters, and SQL-function fallbacks |
| Array-built ordering | ❌ | Example: `ORDER BY ${Object.entries(ordering).flatMap(...)}` |
| Identifier transforms | ❌ | Examples: `postgres({ transform: postgres.camel })` and `sql("aTest")` |
| Multiple statements with `.simple()` | ❌ | Example: `` sql`SELECT 1; SELECT 2;`.simple() `` |

The [postgres.js demo](https://github.com/ts-safeql/safeql/tree/master/demos/postgresjs-demo) intentionally keeps unsupported cases visible.

## Manual Configuration

If you prefer not to use the plugin, you can still configure SafeQL for plain postgres.js tags:

::: tabs key:eslintrc

== Flat Config

```js
// eslint.config.js

import safeql from "@ts-safeql/eslint-plugin/config";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ...
  safeql.configs.connections({
    targets: [{ tag: "sql", transform: "{type}[]" }],
  }),
);
```

== Legacy Config

1. Add `@ts-safeql/eslint-plugin` to your ESLint plugins:

```json{3}
// .eslintrc.json

{
  "plugins": [..., "@ts-safeql/eslint-plugin"],
  ...
}
```

2. Add `@ts-safeql/check-sql` to your rules and set the `connections` option:

```json
// .eslintrc.json

{
  "rules": {
    "@ts-safeql/check-sql": [
      "error",
      {
        "connections": [
          {
            "targets": [{ "tag": "sql", "transform": "{type}[]" }]
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
import { sql } from "postgres";
import { myClient } from "./myClient"; // Read the note above

// Before:
const query = sql`SELECT idd FROM users`
                         ~~~ Error: column "idd" does not exist // [!code error]

// After bug fix:
const query = sql`SELECT id FROM users`
              ~~~ Error: Query is missing type annotation // [!code error]

// After: ✅
const query = sql<{ id: number; }[]>`SELECT id FROM users`
```