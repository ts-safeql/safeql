# @ts-safeql/generate

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
