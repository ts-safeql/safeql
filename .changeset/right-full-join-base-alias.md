---
"@ts-safeql/generate": patch
---

Fix `RIGHT`/`FULL JOIN` nullability when the base (left) relation is aliased.

A column selected from the base relation of a `RIGHT`/`FULL JOIN` is nullable (its row may be absent when the other side has no match), and SafeQL already inferred this when the base relation had no alias. But the base relation's alias was never tracked, so `SELECT m.id FROM member m RIGHT JOIN member_team mt ON ...` incorrectly typed `m.id` as non-null. The join analysis now records the base relation's alias and matches nullability against it, so aliased and unaliased base relations behave the same.
