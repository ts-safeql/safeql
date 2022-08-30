## TODO

### Technical tasks
[x] (V1) CI - Use a monorepo tool (turborepo).
[x] (V1) CI - Add CI.
[ ] (V1) Bug - Don't run linter in .js files.
[ ] (V1) Clean Code - Add ESLint & Prettier
[ ] (V1) Config - "migrationsDir" (will require the user to supply "shadowDatabaseUrl" as well).
[ ] (V1) Config - connVarName and connVarProperties.
[ ] (V1) Tests - add lots and lots of tests.
[ ] (V1) Documentation
[ ] (V1) CI - Make tests pass.

[ ] (V2) Feature - Opt-in for branded types (TableId rather than number).
[x] (V2) Clean Code - Refactor the rule code for clarity and robustness.
[ ] (V2) Clean Code - Refactor the generate code for clarity and robustness.
[ ] (V2) Config - Multi-database support.
[ ] (V2)] CI - changesets

### Product tasks
[ ] Think of a name for the library (SafeQL?)
[ ] Logo (https://bit.ly/3dZISKp)

### Known issues
- Given the following code, The plugin won't throw an error, since it looks at the first possible type (consider disallowing unions):
```ts
const value: number | string = 'foo';
conn.query(sql`SELECT col FROM table WHER int_col = ${value}); // BUG!
``` 