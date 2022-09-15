# @ts-safeql/docs

## 1.1.0

### Minor Changes

- 13a33b4: Introducing a new package @ts-safeql/sql-tag. It's an sql template tag that is meant to use with sql libraries that doesn't have a built-in support for sql template tags such as node-pg, and sequelize.

## 1.0.1

### Patch Changes

- 30c5b98: Tag-only types are now available using the "tagName" setting:

  For example (Postgres.js):

  ```json
  {
    "databaseUrl": "postgres://postgres:postgres@localhost:5432/safeql_postgresjs_demo",
    "tagName": "sql",
    "transform": "${type}[]"
  }
  ```

  ```typescript
  import { sql } from "postgres";

  const query = sql`SELECT id FROM users`;
                ^^^ // Error: Query is missing type annotation

  // After: ✅
  const query = sql<{ id: number; }[]>`SELECT id FROM users`;
  ```
