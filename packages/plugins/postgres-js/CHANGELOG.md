# @ts-safeql/plugin-postgres-js

## 4.3.1

### Patch Changes

- 8f15d09: Recognize clients typed as Postgres.js `ISql` (available since `postgres@3.4.9`). Tagged templates and helper calls on an `ISql`-typed client are now linted the same way as `Sql`, `TransactionSql`, and `ReservedSql`, instead of reporting the interpolated helper as an unsupported parameter type.

## 4.3.0

### Minor Changes

- d6dbf34: Add the experimental Postgres.js plugin (`@ts-safeql/plugin-postgres-js`).

  The plugin resolves Postgres.js queries and their dynamic helpers to the
  underlying SQL so SafeQL can type-check them. Supported helpers: `sql(...)` for
  identifiers, inserts, updates, and values; `sql.unsafe`; `sql.typed`; nested
  `sql` fragments; and transaction and reserved-connection tags.
