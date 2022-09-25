# @ts-safeql/shared

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
