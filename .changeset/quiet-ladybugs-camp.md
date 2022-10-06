---
"@ts-safeql/docs": patch
"@ts-safeql/eslint-plugin": patch
---

`databaseName` is now optional (when using migrations config). It will fallback to a default value `safeql_{project_name}_{migrations_dir_hash}` ([read more here](https://safeql.dev/api/index.html#connections-databasename-optional))
