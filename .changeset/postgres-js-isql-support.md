---
"@ts-safeql/plugin-postgres-js": patch
---

Recognize clients typed as Postgres.js `ISql` (available since `postgres@3.4.9`). Tagged templates and helper calls on an `ISql`-typed client are now linted the same way as `Sql`, `TransactionSql`, and `ReservedSql`, instead of reporting the interpolated helper as an unsupported parameter type.
