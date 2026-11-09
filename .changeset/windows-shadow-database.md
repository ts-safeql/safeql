---
"@ts-safeql/eslint-plugin": patch
---

Use the project directory's basename and a stricter identifier sanitizer when deriving the default shadow database name, so `migrationsDir` works on Windows and with special characters in the folder name.
