# @ts-safeql/docs

## 1.2.0

### Minor Changes

- 9c8ead2: This release introduces a lot of (internal) changes, but to be honest, I'm too lazy to write them all down so I'll mention the highlights:

  ### SafeQL supports Flat Config! 🎉

  You can now use SafeQL with the new ESLint [Flat Config](https://eslint.org/docs/latest/use/configure/configuration-files#configuration-file) API:

  ```js
  // eslint.config.js

  import safeql from "@ts-safeql/eslint-plugin/config";
  import tseslint from "typescript-eslint";

  export default tseslint.config(
    // ...
    safeql.configs.connections({
      // ...
    }),
  );
  ```

  ### SafeQL is now built for both ESM and CJS

  Up until now, I built SafeQL using only TSC (targeting CJS). In order to support both ESM and CJS, I had to use a different build system. I chose to use [unbuild](https://github.com/unjs/unbuild) because it's awesome.

## 1.1.4

### Patch Changes

- 55c010d: update dependencies

## 1.1.3

### Patch Changes

- 1d0f717: `databaseName` is now optional (when using migrations config). It will fallback to a default value `safeql_{project_name}_{migrations_dir_hash}` ([read more here](https://safeql.dev/api/index.html#connections-databasename-optional))

## 1.1.2

### Patch Changes

- b2af01a: (breaking change) `transform`: renamed `${type}` to `{type}`

## 1.1.1

### Patch Changes

- 3d3ca50: allow (column) field case transformation (e.g `"fieldTransform": "camel"` - `user_id` → `userId`)

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
