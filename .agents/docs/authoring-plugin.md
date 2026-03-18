# Authoring a SafeQL Plugin

## Checklist

- [ ] Create a new package under `packages/plugins/<name>/` (see [creating a package](creating-package.md))
- [ ] Add `@ts-safeql/plugin-utils` and `postgres` as dependencies
- [ ] Default-export a `definePlugin()` result
- [ ] Add a demo under `demos/`
- [ ] Add a docs page at `docs/plugins/<name>.md`
- [ ] Add sidebar entry in `docs/.vitepress/config.ts` under "Official Plugins"

## Key Constraints

- Use `type` aliases (not `interface`) for the config type.
- Plugin names are auto-prefixed with `safeql-plugin-`.
- Package names must be prefixed with `plugin-` (e.g., `@ts-safeql/plugin-auth-aws`).
