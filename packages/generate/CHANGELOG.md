# @ts-safeql/generate

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
