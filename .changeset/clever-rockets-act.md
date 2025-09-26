---
"@ts-safeql/generate": patch
---

Fixed jsonb `->>` and `#>>` operators to correctly infer nullable types when left expressions contain column references.
