---
"@ts-safeql/plugin-postgres-js": minor
---

Add the experimental Postgres.js plugin (`@ts-safeql/plugin-postgres-js`).

The plugin teaches SafeQL to understand Postgres.js queries and its dynamic
helpers (`sql(...)` for identifiers/inserts/updates/values, `sql.unsafe`,
`sql.typed`, nested `sql` fragments, and transaction/reserved connection tags),
resolving them to the underlying SQL so queries can be type-checked.
