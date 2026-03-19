# Agent Guidelines

## Common Commands

```sh
pnpm build          # production build (via turbo)
pnpm dev            # stub all packages for local dev
pnpm test           # run all tests (via turbo)
pnpm --filter <pkg> test -- --run   # single package tests
```

## Gotchas

- Never run `pnpm --filter <pkg> build`. Instead, always use `pnpm build` (which handles dependency ordering and output formats correctly).
- For local dev, use `pnpm dev` (stubs via `unbuild --stub`, bypasses rollup entirely).
- A local PostgreSQL instance is expected at `postgres://postgres:postgres@localhost:5432/postgres`.

## References
 - [Creating a New Package](.agents/docs/creating-package.md)
 - [Authoring a Plugin](.agents/docs/authoring-plugin.md)
