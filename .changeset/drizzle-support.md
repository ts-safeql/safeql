---
"@ts-safeql/plugin-drizzle": minor
---

Add `@ts-safeql/plugin-drizzle`, validating Drizzle's `sql` template tag
(`import { sql } from "drizzle-orm"`) and its statically resolvable helpers (`sql.raw`,
`sql.identifier`, `sql.placeholder`, nested fragments). Drizzle's fluent query builder and
column-object interpolation are out of scope. This plugin reuses SafeQL's existing
`onTarget` / `onExpression` hooks with no core changes, demonstrating that the plugin API is
library-agnostic.
