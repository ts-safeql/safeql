# @ts-safeql/safeql

## 0.2.0

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

## 0.1.2

### Patch Changes

- 22a32bd: add type declarations

## 0.1.1

### Patch Changes

- 55c010d: update dependencies

## 0.1.0

### Minor Changes

- 13a33b4: Introducing a new package @ts-safeql/sql-tag. It's an sql template tag that is meant to use with sql libraries that doesn't have a built-in support for sql template tags such as node-pg, and sequelize.
