# Authoring a SafeQL Plugin

## Checklist

- [ ] Create a new package under `packages/plugins/<name>/` (see [creating a package](creating-package.md))
- [ ] Add `@ts-safeql/plugin-utils` as a dependency
- [ ] Add `postgres` as a dependency (if using `createConnection`)
- [ ] Default-export a `definePlugin()` result
- [ ] Add tests under `src/plugin.test.ts` and `src/plugin.integration.test.ts`
- [ ] Add a demo under `demos/plugin-<name>/`
- [ ] Add a docs page at `docs/plugins/<name>.md` or update `docs/compatibility/<name>.md`
- [ ] Add sidebar entry in `docs/.vitepress/config.ts`

## Plugin Hooks

### `createConnection`

Custom database connection strategy. Returns a `postgres` Sql instance.

### `connectionDefaults`

Default config values merged under user config. Use for library-specific type overrides.

### `onTarget({ node, context })`

Called for each TaggedTemplateExpression. Return:

- `TargetMatch` object to proceed with checking
- `false` to skip entirely (e.g., `sql.fragment`)
- `undefined` to defer to SafeQL default

### `onExpression({ node, context })`

Called for each interpolated expression. Return:

- `string` - SQL fragment (use `$N` for placeholder)
- `false` - skip the entire query
- `undefined` - use default `$N::type` behavior

## Key Constraints

- Use `type` aliases (not `interface`) for the config type
- Plugin names are auto-prefixed with `safeql-plugin-`
- Package names must be prefixed with `plugin-` (e.g., `@ts-safeql/plugin-auth-aws`)
- Test file naming: `plugin.test.ts` for unit tests, `plugin.integration.test.ts` for DB tests

## Example Structure

```
packages/plugins/my-lib/
├── src/
│   ├── index.ts              # definePlugin() export
│   ├── plugin.test.ts        # Unit tests (PluginTestDriver)
│   └── plugin.integration.test.ts  # Integration tests (RuleTester)
├── package.json
├── tsconfig.json
└── build.config.ts
```

## Testing

Unit tests use `PluginTestDriver` from `@ts-safeql/plugin-utils/testing`:

```ts
import { PluginTestDriver } from "@ts-safeql/plugin-utils/testing";
import plugin from "./plugin";

const driver = new PluginTestDriver({ plugin: plugin.factory({}) });
const result = driver.toSQL(`import { sql } from "my-lib"; sql.unsafe\`SELECT 1\``);
expect(result).toEqual({ sql: "SELECT 1" });
```

Integration tests use `@typescript-eslint/rule-tester` with a real database.
