---
"@ts-safeql/eslint-plugin": patch
---

## Improved `connections.overrides.types`:

Sometimes, the TypeScript type of the parameter (sql variable) is not the same as the type of the result. For example:

```ts
import postgres from "postgres";
import { sql } from "./sql";

function run(value: postgres.Parameter<LocalDate>)  {
  const result = sql<{ date: LocalDate }>`SELECT ${value}`;
  // ...
}
```

In this case, you can use the following syntax:

```json
{
  "connections": {
    "overrides": {
      "types": {
        "date": {
          // the type of the parameter (can be a glob pattern)
          "parameter": "Parameter<LocalDate>",
          // the generated type
          "return": "LocalDate"
        }
      }
    }
  }
}
```