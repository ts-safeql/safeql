# @ts-safeql/eslint-plugin

## 0.0.15

### Patch Changes

- fbdfb61: Change autofix fromNullable generic (e.g. `Nullable<string>`) to type union format (e.g. string | null)
- 7bf6f6a: update packages postgres dependency to 3.3.0
- Updated dependencies [fbdfb61]
- Updated dependencies [7bf6f6a]
  - @ts-safeql/generate@0.0.6
  - @ts-safeql/shared@0.0.5
  - @ts-safeql/test-utils@0.0.5

## 0.0.14

### Patch Changes

- 1467215: when returning an array column, return an array type instead of identifer (e.g instead of `Array<type>` return `type[]`).
- Updated dependencies [1467215]
  - @ts-safeql/generate@0.0.5

## 0.0.13

### Patch Changes

- a49dbbf: fixed a bug that caused the plugin to crash when esbuild was not installed
- e374733: improve lint speed by up to 33%

## 0.0.12

### Patch Changes

- 3d3ca50: allow (column) field case transformation (e.g `"fieldTransform": "camel"` - `user_id` → `userId`)
- Updated dependencies [3d3ca50]
  - @ts-safeql/generate@0.0.4
  - @ts-safeql/shared@0.0.4
  - @ts-safeql/test-utils@0.0.4

## 0.0.11

### Patch Changes

- 69b874e: you can now override the default types (e.g. timestamp -> DateTime) by adding an `overrides` property to the config:

  ```ts
  // safeql.config.ts
  import { definedConfig } from "@ts-safeql/eslint-plugin";

  export default definedConfig({
    // ...
    overrides: {
      types: {
        timestamp: "DateTime",
      },
    },
  });
  ```

  or

  ```json
  // .eslintrc.json
  {
    // ...
    "connections": {
      // ...,
      "overrides": {
        "types": {
          "timestamp": "DateTime"
        }
      }
    }
  }
  ```

- Updated dependencies [69b874e]
  - @ts-safeql/generate@0.0.3
  - @ts-safeql/shared@0.0.3
  - @ts-safeql/test-utils@0.0.3

## 0.0.10

### Patch Changes

- 1a55018: allow to compare actual type against type reference (sql<TypeReference>)

## 0.0.9

### Patch Changes

- 853f943: fixed an issue where using a config file with invalid state kept a temporary config file

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
