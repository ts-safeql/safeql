# @ts-safeql/eslint-plugin

## 1.1.2

### Patch Changes

- c5b4af1: add support for custom type overrides
- Updated dependencies [c5b4af1]
  - @ts-safeql/generate@0.1.1
  - @ts-safeql/shared@0.1.1
  - @ts-safeql/test-utils@0.0.11

## 1.1.1

### Patch Changes

- 6c15534: fixed an issue where INSERT INTO with a null value was invalid

## 1.1.0

### Minor Changes

- 30965b2: add support for regex matching
- dc5ed22: add support for `skipTypeAnnotations`.

### Patch Changes

- 92ca1bd: fixed an issue where SafeQL throwed an error when inserting a nullable value into a nullable column
- Updated dependencies [30965b2]
  - @ts-safeql/generate@0.1.0
  - @ts-safeql/shared@0.1.0
  - @ts-safeql/test-utils@0.0.10

## 1.0.2

### Patch Changes

- d221910: ## Improved `connections.overrides.types`:

  Sometimes, the TypeScript type of the parameter (sql variable) is not the same as the type of the result. For example:

  ```ts
  import postgres from "postgres";
  import { sql } from "./sql";

  function run(value: postgres.Parameter<LocalDate>) {
    const result = sql<{ date: LocalDate }>`SELECT ${value}`;
    // ...
  }
  ```

  In this case, you can use the following syntax:

  ```json
  {
    "connections": {
      "overrides": {
        "types": {
          "date": {
            // the type of the parameter (can be a glob pattern)
            "parameter": "Parameter<LocalDate>",
            // the generated type
            "return": "LocalDate"
          }
        }
      }
    }
  }
  ```

## 1.0.1

### Patch Changes

- 77c060d: fix array type inference.
  change default time(tz) type to string.
- Updated dependencies [77c060d]
  - @ts-safeql/generate@0.0.15
  - @ts-safeql/shared@0.0.9
  - @ts-safeql/test-utils@0.0.9

## 1.0.0

### Major Changes

- 55c010d: After 7 months of development, I'm happy to announce the release of the first major version of SafeQL!

  # Breaking changes!

  Until now, the way to configure where SafeQL will look for the queries and how to transform them was in the connectio level. For instance:

  ```json
  {
    "connection": {
      "databaseUrl": "postgres://postgres:postgres@localhost:5432/my_database",
      "tagName": "sql",
      "transform": "{type}[]",
      "fieldTransform": "camel"
    }
  }
  ```

  While that was a good start, it was not flexible enough. For instance, if you wanted to use the same connection for multiple tags, you would have to duplicate the connection configuration over and over again.

  ```json
  {
    "connection": {
      // ...
      "name": "dataSource",
      "operators": ["query", "queryOne"]
    },
    "connection": {
      // ... the same connection as before
      "name": "conn",
      "operators": ["query", "queryOne"]
    }
  }
  ```

  To tackle this, a new property called `targets` will now hold all of the targets that should be checked. This way, you can have multiple targets for the same connection, with the ability to transform them differently.

  ```json
  {
    "connection": {
      // ...
      "targets": [
        {
          "tag": "sqlX",
          "transform": "{type}[]",
          "fieldTransform": "camel"
        },
        {
          // glob pattern is supported as well
          "wrapper": "dataSource.+(query|queryOne)",
          "transform": "{type}[]",
          "fieldTransform": "camel"
        }
      ]
    }
  }
  ```

  Migration guide:

  If you were using `name` and `operators` to define a target, you can now use the `wrapper` property instead:

  ```diff
  {
    "connection": {
      // ...
  -   "name": "dataSource",
  -   "operators": ["query", "queryOne"],
  -   "transform": "{type}[]",
  -   "fieldTransform": "camel"
  +   "targets": [
  +     {
  +       "wrapper": "dataSource.+(query|queryOne)",
  +       "transform": "{type}[]",
  +       "fieldTransform": "camel"
  +     }
  +   ]
    }
  }
  ```

  If you were using `tagName` to define a target, you can now use the `tag` property instead:

  ```diff
  {
    "connection": {
      // ...
  -   "tagName": "sql",
  -   "transform": "{type}[]",
  -   "fieldTransform": "camel"
  +   "targets": [
  +     {
  +       "tag": "sql",
  +       "transform": "{type}[]",
  +       "fieldTransform": "camel"
  +     }
  +   ]
    }
  }
  ```

### Patch Changes

- Updated dependencies [55c010d]
  - @ts-safeql/test-utils@0.0.8
  - @ts-safeql/generate@0.0.14
  - @ts-safeql/shared@0.0.8

## 0.0.29

### Patch Changes

- 647b69c: fixed an issue where expressions with `this` were ignored.

## 0.0.28

### Patch Changes

- 071ef8d: fixed an issue where domain types could potentially crash the plugin
- Updated dependencies [071ef8d]
  - @ts-safeql/generate@0.0.13

## 0.0.27

### Patch Changes

- 9ac7829: Properties ordering should not be taken into account when SafeQL compares between the expected and actual type annotations.
- Updated dependencies [9ac7829]
  - @ts-safeql/generate@0.0.12

## 0.0.26

### Patch Changes

- ac05926: return the actual error message with the duplicate columns on error
- 92505a1: add default type mapping when comparing TS types to PostgreSQL types.
- 92505a1: make "unsupported type" error more informative.
- Updated dependencies [ac05926]
- Updated dependencies [92505a1]
  - @ts-safeql/shared@0.0.7
  - @ts-safeql/generate@0.0.11
  - @ts-safeql/test-utils@0.0.7

## 0.0.25

### Patch Changes

- 5cf757a: add support for enums. for example, given the following schema:

  ```sql
  CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');

  CREATE TABLE person (
      ...,
      mood mood NOT NULL
  );
  ```

  we get the exact enum type:

  ```ts
  sql<{ mood: "sad" | "ok" | "happy" }[]>`SELECT mood FROM person`;
  ```

- Updated dependencies [5cf757a]
  - @ts-safeql/generate@0.0.10

## 0.0.24

### Patch Changes

- a16d812: update libpg-query peer dependency from (^13.2.5) to (>=13.2.5)

## 0.0.23

### Patch Changes

- c3b85b2: This change introduce two improvements:

  ## Support union of the same type inside a query

  Previously, this caused an error:

  ```ts
  type UnionOfStrings = "A" | "B";
  function run(sql: Sql, union: UnionOfStrings) {
    // ❌ Invalid Query: the type "UnionOfStrings" is not supported
    return sql`SELECT id FROM users WHERE name = ${union}`);
  }
  ```

  Now, this is supported:

  ```ts
  type UnionOfStrings = "A" | "B";
  function run(sql: Sql, union: UnionOfStrings) {
    // ✅ Valid Query
    return sql`SELECT id FROM users WHERE name = ${union}`);
  }
  ```

  Please note that this is only supported for unions of the same type. Meaning, this is still not supported:

  ```ts
  type UnionOfMixedTypes = "A" | 1;
  function run(sql: Sql, union: UnionOfMixedTypes) {
    // ❌ Invalid Query: Union types must be of the same type (found string, number)
    return sql`SELECT id FROM users WHERE name = ${union}`);
  }
  ```

  ## Improved support for overriden types

  Sometimes, we want to pass non-primitive types that are serializable (such as Date). Previously, this caused an error:

  ```ts
  function run(sql: Sql, date: Date) {
    // ❌ Invalid Query: the type "Date" is not supported
    return sql`SELECT id FROM users WHERE name = ${date}`);

    // ⚠️ A workaround was to stringify the date:
    return sql`SELECT id FROM users WHERE name = ${date.toString()}`);
  }
  ```

  At first, this was by design. Since SafeQL didn't know what should `date` be. Is it a date, timestamp, or timestamptz?

  Today, this is possible to do by configuring the [`overrides.types`](https://safeql.dev/api/index.html#connections-overrides-types-optional). SafeQL will check the type that is compared against, and use the correct type:

  ```json
  {
    "overrides": {
      "types": {
        "Date": "timestamptz"
      }
    }
  }
  ```

  This will allow the following query to be valid:

  ```ts
  function run(sql: Sql, date: Date) {
    return sql`SELECT id FROM users WHERE name = ${date}`);
    // ✅ Valid Query (The query will be evaulated as `SELECT id FROM users WHERE name = $1::timestamptz`)
  }
  ```

## 0.0.22

### Patch Changes

- ea64b55: fixed an issue when introspecting a nullable column that was evaluated as "any" caused a mismatch
- Updated dependencies [ea64b55]
  - @ts-safeql/generate@0.0.9

## 0.0.21

### Patch Changes

- 3517c62: improved the type comparison between actual and expected query results (e.g., `Pick<Entity, "id"> = { id: number }`)

## 0.0.20

### Patch Changes

- c431a4e: fix a bug where columns were non-nullable while they should've been due to right/full join expressions

  ![column nullability by joins](https://user-images.githubusercontent.com/10504365/196818229-c6b43fa3-8a48-4891-800b-0151c35077d8.gif)

- Updated dependencies [c431a4e]
  - @ts-safeql/generate@0.0.8

## 0.0.19

### Patch Changes

- a6b0301: Allow to watch for migrations dir for cache invalidation (can be turned off with `connection.watchMode: false`)
- Updated dependencies [a6b0301]
- Updated dependencies [a6b0301]
  - @ts-safeql/generate@0.0.7
  - @ts-safeql/shared@0.0.6
  - @ts-safeql/test-utils@0.0.6

## 0.0.18

### Patch Changes

- cdeb711: query that returns nothing shouldn't have a type annotation (previously fixed to `<null>`).

## 0.0.17

### Patch Changes

- 1d0f717: `databaseName` is now optional (when using migrations config). It will fallback to a default value `safeql_{project_name}_{migrations_dir_hash}` ([read more here](https://safeql.dev/api/index.html#connections-databasename-optional))
- 19cbe8d: lint only TypeScript files (ends with `.ts`, `.tsx`, `.mts`, `.mtsx`)

## 0.0.16

### Patch Changes

- b2af01a: (breaking change) `transform`: renamed `${type}` to `{type}`

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
    "transform": "{type}[]"
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
        "transform": "{type}[]"
      }
    ]
  }
  ```

  `{type}` will be replaced by the original type that was generated. In this case, we are transforming it into an array:

  ```ts
  // before transformation
  const rows = conn.query<{ id: number }>(conn.sql`SELECT id FROM users`)

  // after transformation
  const rows = conn.query<{ id: number }[]>(conn.sql`SELECT id FROM users`)
                                        ^^
  ```

  transform accepts the following pattern: `string | (string | [(from) string, (to) string])[]`.

  For example:

  - `"transform": "{type}[]"` (add `[]` to the end)
  - `"transform": ["{type}[]"]` (identical to the previous one)
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
