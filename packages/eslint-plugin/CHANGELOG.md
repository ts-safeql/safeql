# @ts-safeql/eslint-plugin

## 0.0.8

### Patch Changes

- c639958: - `connections` can now be a single connection object instead of an array of connections.

  - by setting `{"useConfigFile": true }`, the plugin will use the `safeql.config.ts` file to get the connection/s information:

  ```json
  // .eslintrc.json
  {
    // ...
    "rules": {
      "@ts-safeql/check-sql": ["error", { "useConfigFile": true }]
    }
  }
  ```

  ```typescript
  // safeql.config.ts
  import { defineConfig } from "@ts-safeql/eslint-plugin";

  export default defineConfig({
    connections: {
      // ...
    },
  });
  ```

  By moving the configuration into a `.ts` file, we get full auto-completion, which should help configure the connections and find errors.

  Please note that `safeql.config.ts` should be at the root of your project.

## 0.0.7

### Patch Changes

- 6b99b38: improve sql migrations detection by deeply lookup inside the specified migrationsDir

## 0.0.6

### Patch Changes

- 557d419: Improve type inference for non-table columns
- Updated dependencies [557d419]
  - @ts-safeql/generate@0.0.2
  - @ts-safeql/shared@0.0.2
  - @ts-safeql/test-utils@0.0.2

## 0.0.5

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

## 0.0.4

### Patch Changes

- 597f863: type transformation is now possible.

  For example:

  ```json
  {
    // ...
    "connections": [
      {
        // ...
        "transform": "${type}[]"
      }
    ]
  }
  ```

  `${type}` will be replaced by the original type that was generated. In this case, we are transforming it into an array:

  ```ts
  // before transformation
  const rows = conn.query<{ id: number }>(conn.sql`SELECT id FROM users`)

  // after transformation
  const rows = conn.query<{ id: number }[]>(conn.sql`SELECT id FROM users`)
                                        ^^
  ```

  transform accepts the following pattern: `string | (string | [(from) string, (to) string])[]`.

  For example:

  - `"transform": "${type}[]"` (add `[]` to the end)
  - `"transform": ["${type}[]"]` (identical to the previous one)
  - `"transform": [["Nullable", "Maybe"]]` (replaces `Nullable` with `Maybe`)

## 0.0.3

### Patch Changes

- 52bfc3c: Support conditional expression syntax inside queries

## 0.0.2

### Patch Changes

- bababca: Support X.sql`` syntax

## 0.0.1

### Patch Changes

- initial release
- Updated dependencies
  - @ts-safeql/generate@0.0.1
  - @ts-safeql/shared@0.0.1
  - @ts-safeql/test-utils@0.0.1
