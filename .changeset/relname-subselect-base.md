---
"@ts-safeql/generate": patch
---

Fix `Internal error: relName is undefined` when the base (leftmost) relation in a join is a subquery (e.g. `FROM (SELECT ...) t CROSS JOIN ...`).
