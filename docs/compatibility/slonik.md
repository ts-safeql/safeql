---
layout: doc
---

# SafeQL :heart: Slonik

SafeQL is compatible with [Slonik](https://github.com/gajus/slonik) with full support for Slonik's SQL helpers and Zod schema validation.

## Using the Slonik Plugin (Experimental)

::: warning EXPERIMENTAL
The Slonik plugin is experimental and may change in future releases.
:::

```bash
npm install @ts-safeql/plugin-slonik
```

```js
// eslint.config.js
import safeql from "@ts-safeql/eslint-plugin/config";
import slonik from "@ts-safeql/plugin-slonik";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ...
  safeql.configs.connections({
    databaseUrl: "postgres://user:pass@localhost:5432/db",
    plugins: [slonik()],
  }),
);
```

The Slonik plugin defaults `sql.type(...)` schema mismatches to suggestions instead of autofix.
If you want `--fix` to rewrite the schema automatically, set `enforceType: "fix"` in the connection config.

### Zod Schema Validation

SafeQL validates your Zod schemas against the actual query results:

```typescript
import { z } from "zod";
import { sql } from "slonik";

// Wrong field type → suggestion by default
const query = sql.type(z.object({ id: z.string() }))`SELECT id FROM users`;
//                                   ~~~~~~~~~~
// Error: Zod schema does not match query result.
//        Expected: z.object({ id: z.number() })

// Correct ✅
const query = sql.type(z.object({ id: z.number() }))`SELECT id FROM users`;
```

### Fragment Embedding

Fragment variables are automatically inlined:

```typescript
const where = sql.fragment`WHERE id = 1`;
const query = sql.unsafe`SELECT * FROM users ${where}`;
// Analyzed as: SELECT * FROM users WHERE id = 1
```

### Support Matrix

Legend: `✅` supported, `⚠️` partial support, `❌` unsupported.

| Library syntax | Support | Notes |
| -------------- | ------- | ----- |
| `sql.unsafe` | ✅ | Validated as a query, type annotations skipped |
| `sql.type(schema)` | ✅ | Validated as a query, Zod schema checked against DB result types; suggestions by default, autofix with `enforceType: "fix"` |
| `sql.typeAlias("name")` | ✅ | Validated as a query, type annotations skipped |
| Embedded fragment variables like `${sql.fragment\`...\`}` | ✅ | Inlined into the outer query |
| Standalone `sql.fragment` | ⚠️ | Intentionally skipped because it is not a complete query on its own |
| `sql.identifier(["schema", "table"])` | ✅ | Inlined as escaped identifiers |
| `sql.json(...)`, `sql.jsonb(...)`, `sql.binary(...)`, `sql.date(...)`, `sql.timestamp(...)`, `sql.interval(...)`, `sql.uuid(...)` | ✅ | Rewritten to typed SQL placeholders |
| `sql.array([...], "type")` | ✅ | Rewritten as `type[]` |
| `sql.unnest([...], ["type1", "type2"])` | ✅ | Rewritten as `unnest(type1[], type2[])` |
| `sql.literalValue("foo")` | ✅ | Inlined as a SQL literal |
| `sql.join(...)` | ❌ | Query is skipped because the composition is too dynamic to analyze safely |

## Manual Configuration

If you prefer not to use the plugin, you can configure SafeQL manually:

::: tabs key:eslintrc

== Flat Config

```js
// eslint.config.js

import safeql from "@ts-safeql/eslint-plugin/config";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ...
  safeql.configs.connections({
    // ... (read more about configuration in the API docs)
    targets: [
      {
        tag: "sql.+(type\\(*\\)|typeAlias\\(*\\)|unsafe)",
        skipTypeAnnotations: true,
      },
    ],
  }),
);
```

== Legacy Config

1. Add `@ts-safeql/eslint-plugin` to your ESLint plugins:

```json{3}
// .eslintrc.json

{
  "plugins": [..., "@ts-safeql/eslint-plugin"],
  ...
}
```

2. Add `@ts-safeql/check-sql` to your rules and set the `connections` option:

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
            // ... (read more about configuration in the API docs)
            "targets": [
              {
                "tag": "sql.+(type\\(*\\)|unsafe)",
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

:::

::: warning Manual Configuration Limitations
The manual approach doesn't support Zod schema validation, helper translation, or fragment inlining. For full Slonik support, use the plugin.
:::
