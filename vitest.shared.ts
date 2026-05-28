import { defineConfig } from "vitest/config";

/**
 * Shared vitest defaults for every package in the monorepo.
 *
 * `watch: false` keeps non-interactive and agent-driven runs from hanging in
 * watch mode. The timeouts give the DB-integration suites headroom, since they
 * run concurrently against a single Postgres under `turbo` and the 5s default
 * is too tight under CI load. Each package re-exports this from its own
 * `vitest.config.ts` because vitest resolves its config from the package's cwd.
 */
export default defineConfig({
  test: {
    watch: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
