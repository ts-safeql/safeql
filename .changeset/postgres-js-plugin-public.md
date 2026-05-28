---
"@ts-safeql/plugin-postgres-js": minor
---

Add the experimental Postgres.js plugin (`@ts-safeql/plugin-postgres-js`).

The plugin resolves Postgres.js queries and their dynamic helpers to the
underlying SQL so SafeQL can type-check them. Supported helpers: `sql(...)` for
identifiers, inserts, updates, and values; `sql.unsafe`; `sql.typed`; nested
`sql` fragments; and transaction and reserved-connection tags.
