# @ts-safeql/plugin-auth-aws

## 4.3.1

### Patch Changes

- 71d63b5: Fix TypeScript types failing to resolve in CommonJS projects.
- Updated dependencies [71d63b5]
  - @ts-safeql/plugin-utils@5.0.1

## 4.3.0

### Minor Changes

- acd33af: Add experimental plugin API and AWS auth plugin

  - Experimental plugin system for extending SafeQL with custom behavior
  - First official plugin: `@ts-safeql/plugin-auth-aws` for AWS RDS IAM authentication

### Patch Changes

- Updated dependencies [00b9904]
- Updated dependencies [acd33af]
  - @ts-safeql/plugin-utils@5.0.0
