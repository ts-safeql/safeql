---
"@ts-safeql/eslint-plugin": patch
---

Point invalid-query errors at the offending identifier. When Postgres reports an unknown column, table, relation, type, or function, the squiggle now lands on that specific token instead of the whole query — most noticeably for Kysely builder chains, where the error previously underlined the entire embedded `sql` fragment.
