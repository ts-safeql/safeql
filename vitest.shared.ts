import { defineConfig } from "vitest/config";

/**
 * Shared vitest defaults for every package in the monorepo.
 *
 * `watch: false` keeps non-interactive and agent-driven runs from hanging in
 * watch mode. Each package re-exports this from its own `vitest.config.ts`
 * because vitest resolves its config from the package's working directory.
 */
export default defineConfig({
  test: {
    watch: false,
  },
});
