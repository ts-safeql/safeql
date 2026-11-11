---
"@ts-safeql/eslint-plugin": patch
---

Use the project directory's basename and a stricter identifier sanitizer when deriving the default shadow database name, so `migrationsDir` works on Windows and with special characters in the folder name. The generated name also stays within PostgreSQL's 63-byte identifier limit and includes the full project path in its discriminator.
