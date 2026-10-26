---
"@ts-safeql/plugin-kysely": patch
---

Builder mode no longer executes code from the linted file: it builds the query by calling Kysely directly with statically known values.
