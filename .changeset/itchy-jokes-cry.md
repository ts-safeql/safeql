---
"@ts-safeql/eslint-plugin": minor
"@ts-safeql/generate": minor
---

Enabling `targets.strictNullChecks` makes SafeQL treat all database columns as nullable by default unless confirmed as non-nullable.

For instance, if a column is a constant, i.e., `SELECT 1`, it is inferred as non-nullable, as it will always return this constant value. Likewise, columns defined with a NOT NULL constraint in the database schema are also treated as non-nullable.

SQL procedures also follow this rule. For example, the `count` function always returns a non-nullable value, since even the count of an empty set is 0, a non-null integer. Conversely, procedures like `sum` could return a null (e.g., the sum of an empty set), and are therefore treated as nullable.
