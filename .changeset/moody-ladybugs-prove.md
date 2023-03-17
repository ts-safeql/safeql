---
"@ts-safeql/eslint-plugin": patch
"@ts-safeql/generate": patch
---

add support for enums. for example, given the following schema:
```sql
CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');  

CREATE TABLE person (
    ...,
    mood mood NOT NULL
);
```

we get the exact enum type:
```ts
sql<{ mood: "sad" | "ok" | "happy" }[]>`SELECT mood FROM person`;
```
