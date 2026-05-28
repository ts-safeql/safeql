# @ts-safeql/plugin-postgres-js

## 4.3.0

### Minor Changes

- d6dbf34: Add the experimental Postgres.js plugin (`@ts-safeql/plugin-postgres-js`).

  The plugin resolves Postgres.js queries and their dynamic helpers to the
  underlying SQL so SafeQL can type-check them. Supported helpers: `sql(...)` for
  identifiers, inserts, updates, and values; `sql.unsafe`; `sql.typed`; nested
  `sql` fragments; and transaction and reserved-connection tags.
