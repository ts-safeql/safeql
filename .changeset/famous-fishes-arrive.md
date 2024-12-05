---
"@ts-safeql/eslint-plugin": minor
"@ts-safeql/generate": minor
---

**Improved Error Reporting** - Previously, errors could point to incorrect positions due to query transformations behind the scene. Now, errors align precisely with your source code, making debugging easier.

**Better Type Handling** - String expressions previously required manual casting to work with stricter types like enums, often causing type errors. This update removes the need for manual casting by ensuring seamless compatibility.

**Forceful Shadow Database Dropping** - When using the migrations strategy, shadow databases are now forcefully dropped (if supported). This is an internal improvement to prevent edge cases and ensure smoother migrations.
