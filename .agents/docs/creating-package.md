# Creating a New Package

1. Create the directory under `packages/` (or `packages/plugins/` for plugins)
2. Add `package.json` — mirror an existing package for the `name`, `exports`, `scripts`, and `type` fields
3. Add `tsconfig.json` extending the root `tsconfig.node.json` (adjust the relative path based on depth)
4. Add `build.config.ts` — copy from an existing package
5. Run `pnpm install`
6. Workspace glob `packages/plugins/*` is already in `pnpm-workspace.yaml`
