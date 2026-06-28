---
"@ts-safeql/plugin-kysely": minor
"@ts-safeql/plugin-utils": minor
"@ts-safeql/eslint-plugin": patch
---

Validate the `<T>` annotation on raw `sql` fragments embedded in Kysely query-builder chains.

SafeQL now checks that annotation against the type the database returns and autofixes it on a mismatch. A selection like ``sql<number>`name || bio`.as("credit_line")`` whose column is `string` gets flagged; a ``.where(sql<number>`bio is not null`)`` condition gets corrected to `boolean`. Conditions accept both `SqlBool` and `boolean`, and fragments wrapped in parentheses or `as` are checked like bare ones.
