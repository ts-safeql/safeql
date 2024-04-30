---
layout: doc
---

# SafeQL :heart: Slonik

SafeQL is compatible with [Slonik](https://github.com/gajus/slonik) as well with a few setting tweaks.

First, Make sure you've added `@ts-safeql/eslint-plugin` to your ESLint plugins:

```json{3}
// .eslintrc.json
{
  "plugins": [..., "@ts-safeql/eslint-plugin"],
  ...
}
```

Second, add the following rule to your ESLint config:

```json
// .eslintrc.json
{
  // ...
  "rules": {
    // ...
    "@ts-safeql/check-sql": [
      "error",
      {
        "connections": [
          {
            // ...
            "targets": [
              {
                // The name of the tag that should be checked:
                "tag": "sql.+(type\\(*\\)|unsafe)",
                // this will tell safeql to not suggest type annotations
                // since we will be using our Zod schemas in slonik
                "skipTypeAnnotations": true 
              }
            ]
          }
        ]
      }
    ]
  }
}
```

Lastly, SafeQL will be able to lint your queries like so:

```typescript
import { z } from 'zod';
import { sql } from 'slonik';

// Before:
const query = sql.type(z.object({ id: z.number() }))`SELECT idd FROM users`;
                    ~~~ Error: column "idd" does not exist // [!code error]

// After: ✅
const query = sql.type(z.object({ id: z.number() }))`SELECT id FROM users`;
```