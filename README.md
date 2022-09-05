## TODO

### Technical tasks
 - [x] (V1) CI - Use a monorepo tool (turborepo).
 - [x] (V1) CI - Add CI.
 - [x] (V1) Clean Code - Add ESLint & Prettier
 - [x] (V1) Config - "migrationsDir" (will require the user to supply  - "shadowDatabaseName" as well).
 - [x] (V1) Feature - Monorepo support in mind
 - [x] (V1) Config - multiple connections support
 - [x] (V1) Feature - support array arg.
 - [x] (V1) Tests - add lots and lots of tests.
 - [x] (V1) Chore - figure out whether I should use --save-exact or not
 - [ ] (V1) Example
    - [ ] Prisma
    - [ ] Sequalize
 - [ ] (V1) Documentation
 - [ ] (V1) CI - Make tests pass.

 - [ ] (V2) Feature - Opt-in for branded types (TableId rather than  - number).
 - [ ] (V2) Feature - support custom args.
 - [ ] (V2) Feature - support ternary operation args.
 - [x] (V2) Clean Code - Refactor the rule code for clarity and  - robustness.
 - [ ] (V2) Feature - Watch for migration folder changes for database invalidation.
 - [ ] (V2) Feature - Shadow caching.
 - [ ] (V2) Clean Code - Refactor the generate code for clarity and  - robustness.
 - [ ] (V2) Config - Multi-database support.
 - [ ] (V2) Feature - sql views
 - [ ] (V2) Feature - sql fragments
 - [ ] (V2) Feature - add default value for "shadowDatabaseName" (safeql_shadow_{package-name}_)
 - [ ] (V2)] CI - changesets
 - [ ] (V2) Bug - Don't run linter in .js files.
 - [ ] (V2) Performance - Improve overall performance.
 - [ ] (V2) Clean Code - Improve database initialization code flow.

### Product tasks
 - [x] (V1) Think of a name for the library: SafeQL
 - [ ] (V2) Logo (https://bit.ly/3dZISKp)

### Known issues
- Given the following code, The plugin won't throw an error, since it looks at the first possible type (consider disallowing unions):
```ts
const value: number | string = 'foo';
conn.query(sql`SELECT col FROM table WHER int_col = ${value}); // BUG!
``` 