# @ts-safeql/generate

## 3.4.1

### Patch Changes

- 0e1b971: fixed an issue where a query with union would fail
  - @ts-safeql/shared@3.4.1
  - @ts-safeql/sql-ast@3.4.1
  - @ts-safeql/test-utils@0.0.24

## 3.4.0

### Patch Changes

- @ts-safeql/shared@3.4.0
- @ts-safeql/sql-ast@3.4.0
- @ts-safeql/test-utils@0.0.23

## 3.3.2

### Patch Changes

- 09175c6: fix: distinguish schema in table/column resolution (by @TanguyFir)
  - @ts-safeql/shared@3.3.2
  - @ts-safeql/sql-ast@3.3.2
  - @ts-safeql/test-utils@0.0.22

## 3.3.1

### Patch Changes

- @ts-safeql/shared@3.3.1
- @ts-safeql/sql-ast@3.3.1
- @ts-safeql/test-utils@0.0.21

## 3.3.0

### Patch Changes

- @ts-safeql/shared@3.3.0
- @ts-safeql/sql-ast@3.3.0
- @ts-safeql/test-utils@0.0.20

## 3.2.2

### Patch Changes

- @ts-safeql/shared@3.2.2
- @ts-safeql/sql-ast@3.2.2
- @ts-safeql/test-utils@0.0.19

## 3.2.1

### Patch Changes

- @ts-safeql/shared@3.2.1
- @ts-safeql/sql-ast@3.2.1
- @ts-safeql/test-utils@0.0.18

## 3.2.0

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

### Patch Changes

- @ts-safeql/shared@3.2.0
- @ts-safeql/sql-ast@3.2.0
- @ts-safeql/test-utils@0.0.17

## 3.1.0

### Minor Changes

- 56c956c: You can now modify the expected type for each table column. This could be useful when dealing with
  dynamic types such as JSONB or when you want to enforce a specific type for a column.

  ```json
  {
    // ...,
    "overrides": {
      "columns": {
        "table_name.column_name": "CustomType"
      }
    }
  }
  ```

  You can read more about it in the [documentation](https://safeql.dev/api/#connections-overrides-columns-optional)

### Patch Changes

- @ts-safeql/shared@3.1.0
- @ts-safeql/test-utils@0.0.16

## 3.0.2

### Patch Changes

- @ts-safeql/shared@3.0.2
- @ts-safeql/test-utils@0.0.15

## 3.0.1

### Patch Changes

- @ts-safeql/shared@3.0.1
- @ts-safeql/test-utils@0.0.14

## 3.0.0

### Major Changes

- 649a592: Significantly improved the validation and type-inference of JSON/B expressions (e.g., jsonb_agg, json_build_object).

  Before:

  ```ts
  sql<{ rows: any[] }>`
    SELECT jsonb_agg(json_build_object('id', id, 'name', name)) AS rows
  `;
  ```

  After:

  ```ts
  sql<{ rows: { id: number; name: string }[] }>`
    SELECT jsonb_agg(json_build_object('id', id, 'name', name)) AS rows
  `;
  ```

### Patch Changes

- 7475acd: improve query type inference by AST lookup
- ad221c9: improved json/b type inference for subselects and aggregators
- 54de7d2: fixed json/b type inference bugs
- 3614126: fix build artifact
- Updated dependencies [7475acd]
- Updated dependencies [3614126]
  - @ts-safeql/shared@3.0.0
  - @ts-safeql/test-utils@0.0.13

## 3.0.0-next.4

### Patch Changes

- 7475acd: improve query type inference by AST lookup
- Updated dependencies [7475acd]
  - @ts-safeql/shared@3.0.0-next.4
  - @ts-safeql/test-utils@0.0.13-next.4

## 3.0.0-next.3

### Patch Changes

- fixed json/b type inference bugs
  - @ts-safeql/shared@3.0.0-next.3
  - @ts-safeql/test-utils@0.0.13-next.3

## 3.0.0-next.2

### Patch Changes

- fix build artifact
- Updated dependencies
  - @ts-safeql/test-utils@0.0.13-next.2
  - @ts-safeql/shared@3.0.0-next.2

## 3.0.0-next.1

### Patch Changes

- improved json/b type inference for subselects and aggregators
  - @ts-safeql/shared@3.0.0-next.1
  - @ts-safeql/test-utils@0.0.13-next.1

## 3.0.0-next.0

### Major Changes

- Significantly improved the validation and type-inference of JSON/B expressions (e.g., jsonb_agg, json_build_object).

Before:

```ts
sql<{ rows: any[] }>`
  SELECT jsonb_agg(json_build_object('id', id, 'name', name)) AS rows
`;
```

After:

````ts
sql<{ rows: { id: number; name: string }[] }>`
  SELECT jsonb_agg(json_build_object('id', id, 'name', name)) AS rows
`;

### Patch Changes

- @ts-safeql/shared@3.0.0-next.0
- @ts-safeql/test-utils@0.0.13-next.0

## 1.0.3

### Patch Changes

- d1b88ff: fixed an issue when selecting from a subselect with a join

## 1.0.2

### Patch Changes

- 5e35a22: Improve join expressions detection

## 1.0.1

### Patch Changes

- 0340f4c: feat: add `nullAsUndefined` and `nullAsOptional` connection options
- 895c4dc: select from subselect with alias should not throw internal error

## 1.0.0

### Major Changes

- f874247: # Enhanced Nullability Checks

  Previously, SafeQL adopted an optimistic standpoint, presuming a returned column to be non-nullable until established otherwise. Albeit this assumption worked fine in a majority of situations, it occasionally led to false positives. To illustrate, let's take a case of `SELECT max(col) FROM ...`. Previously, such a query returned a non-nullable column, disregarding that the `max` function could return `null` if the result set contained no rows (unlike other functions such as `count`).

  ```ts
  // ❌ Previously, this would be considered non-nullable
  const result = await sql<{ max: number }>`SELECT max(col) FROM tbl WHERE FALSE`;

  // ✅ Now, this is considered nullable
  const result = await sql<{ max: number | null }>`SELECT max(col) FROM tbl WHERE FALSE`;

  // ✅✅ You could add a fallback via `coalesce` to make it non-nullable again
  const result = await sql<{ max: number }>`SELECT coalesce(max(col), '0') FROM tbl WHERE FALSE`;
````

Moreover, the nullability checks for WHERE clauses have been enhanced.

```ts
// ❌ Previously, SafeQL annotated a nullable column as null,
// even though it was checked for nullability:
const result = await sql<{ text_nullable: string | null }>`
  SELECT text_nullable FROM tbl WHERE text_nullable IS NOT NULL
`;

// ✅ Now, SafeQL accurately annotates the column as non-nullable
const result = await sql<{ text_nullable: string }>`
  SELECT text_nullable FROM tbl WHERE text_nullable IS NOT NULL
`;
```

### Patch Changes

- Updated dependencies [f874247]
  - @ts-safeql/shared@0.2.0
  - @ts-safeql/test-utils@0.0.12

## 0.1.1

### Patch Changes

- c5b4af1: add support for custom type overrides
- Updated dependencies [c5b4af1]
  - @ts-safeql/shared@0.1.1
  - @ts-safeql/test-utils@0.0.11

## 0.1.0

### Minor Changes

- 30965b2: add support for regex matching

### Patch Changes

- Updated dependencies [30965b2]
  - @ts-safeql/shared@0.1.0
  - @ts-safeql/test-utils@0.0.10

## 0.0.15

### Patch Changes

- 77c060d: fix array type inference.
  change default time(tz) type to string.
- Updated dependencies [77c060d]
  - @ts-safeql/shared@0.0.9
  - @ts-safeql/test-utils@0.0.9

## 0.0.14

### Patch Changes

- 55c010d: update dependencies
- Updated dependencies [55c010d]
  - @ts-safeql/test-utils@0.0.8
  - @ts-safeql/shared@0.0.8

## 0.0.13

### Patch Changes

- 071ef8d: fixed an issue where domain types could potentially crash the plugin

## 0.0.12

### Patch Changes

- 9ac7829: **breaking** Return array tuple rather than a stringified type (e.g `"{ property: string }"` -> `[["property", "string"]]`)

## 0.0.11

### Patch Changes

- Updated dependencies [ac05926]
- Updated dependencies [92505a1]
  - @ts-safeql/shared@0.0.7
  - @ts-safeql/test-utils@0.0.7

## 0.0.10

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

## 0.0.9

### Patch Changes

- ea64b55: fixed an issue when introspecting a nullable column that was evaluated as "any" caused a mismatch

## 0.0.8

### Patch Changes

- c431a4e: fix a bug where columns were non-nullable while they should've been due to right/full join expressions

  ![column nullability by joins](https://user-images.githubusercontent.com/10504365/196818229-c6b43fa3-8a48-4891-800b-0151c35077d8.gif)

## 0.0.7

### Patch Changes

- a6b0301: expose `createGenerator` which creates a `generate` function with a cache inside (rather than global)
- Updated dependencies [a6b0301]
  - @ts-safeql/shared@0.0.6
  - @ts-safeql/test-utils@0.0.6

## 0.0.6

### Patch Changes

- fbdfb61: Change autofix fromNullable generic (e.g. `Nullable<string>`) to type union format (e.g. string | null)
- 7bf6f6a: update packages postgres dependency to 3.3.0
- Updated dependencies [7bf6f6a]
  - @ts-safeql/shared@0.0.5
  - @ts-safeql/test-utils@0.0.5

## 0.0.5

### Patch Changes

- 1467215: when returning an array column, return an array type instead of identifer (e.g instead of `Array<type>` return `type[]`).

## 0.0.4

### Patch Changes

- 3d3ca50: allow (column) field case transformation (e.g `"fieldTransform": "camel"` - `user_id` → `userId`)
- Updated dependencies [3d3ca50]
  - @ts-safeql/shared@0.0.4
  - @ts-safeql/test-utils@0.0.4

## 0.0.3

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
  - @ts-safeql/shared@0.0.3
  - @ts-safeql/test-utils@0.0.3

## 0.0.2

### Patch Changes

- 557d419: Improve type inference for non-table columns
- Updated dependencies [557d419]
  - @ts-safeql/shared@0.0.2
  - @ts-safeql/test-utils@0.0.2

## 0.0.1

### Patch Changes

- initial release
- Updated dependencies
  - @ts-safeql/shared@0.0.1
  - @ts-safeql/test-utils@0.0.1
