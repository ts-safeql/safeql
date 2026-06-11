---
"@ts-safeql/generate": minor
---

Improve view nullability typing.

PostgreSQL reports view columns as nullable by default, so SafeQL previously over-widened many generated types. SafeQL now inspects the view definition and infers non-nullability from the actual SQL expression, while staying conservative when a view cannot be proven safely.
