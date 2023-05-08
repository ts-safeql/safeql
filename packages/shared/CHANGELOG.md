# @ts-safeql/shared

## 0.1.1

### Patch Changes

- c5b4af1: add support for custom type overrides

## 0.1.0

### Minor Changes

- 30965b2: add support for regex matching

## 0.0.9

### Patch Changes

- 77c060d: fix array type inference.
  change default time(tz) type to string.

## 0.0.8

### Patch Changes

- 55c010d: update dependencies

## 0.0.7

### Patch Changes

- ac05926: return the actual error message with the duplicate columns on error
- 92505a1: add default type mapping when comparing TS types to PostgreSQL types.
- 92505a1: make "unsupported type" error more informative.

## 0.0.6

### Patch Changes

- a6b0301: add getOrSetFromMap

## 0.0.5

### Patch Changes

- 7bf6f6a: update packages postgres dependency to 3.3.0

## 0.0.4

### Patch Changes

- 3d3ca50: allow (column) field case transformation (e.g `"fieldTransform": "camel"` - `user_id` → `userId`)

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

## 0.0.2

### Patch Changes

- 557d419: Improve type inference for non-table columns

## 0.0.1

### Patch Changes

- initial release
