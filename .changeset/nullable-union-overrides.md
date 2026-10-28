---
"@ts-safeql/eslint-plugin": patch
---

Normalize union-valued type overrides before comparing query annotations, so nullable unions pass
subsequent checks after autofixing. This preserves the declared type, including temporal unions
such as `Date | number | null`.
