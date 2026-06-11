import vue from "@vitejs/plugin-vue";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rootDir, "../..");
const libpgQueryEmscriptenPath = path.resolve(
  rootDir,
  "node_modules/libpg-query/wasm/libpg-query.js",
);
const libpgQueryEmscriptenId = "\0virtual:libpg-query-emscripten";

function libpgQueryBrowser(): Plugin {
  return {
    name: "libpg-query-browser",
    resolveId(source) {
      if (source === "virtual:libpg-query-emscripten") {
        return libpgQueryEmscriptenId;
      }
    },
    async load(id) {
      if (id !== libpgQueryEmscriptenId) {
        return;
      }

      const code = await fs.readFile(libpgQueryEmscriptenPath, "utf8");
      // Whitespace-tolerant so a libpg-query bump that re-minifies differently doesn't silently
      // skip the patch (a structural change still trips the assertion below).
      const browserCode = code.replace(
        /ENVIRONMENT_IS_NODE\s*=\s*typeof\s+process\s*==\s*"object"\s*&&\s*process\.versions\?\.node\s*&&\s*process\.type\s*!=\s*"renderer"/,
        "ENVIRONMENT_IS_NODE=false",
      );

      if (browserCode === code) {
        throw new Error(`Failed to patch ENVIRONMENT_IS_NODE in ${libpgQueryEmscriptenPath}`);
      }

      return `${browserCode}\nexport default PgQueryModule;\n`;
    },
  };
}

// SharedArrayBuffer (for the synckit Atomics bridge) requires cross-origin isolation.
function crossOriginIsolation(): Plugin {
  const setHeaders = (
    _req: unknown,
    res: { setHeader(name: string, value: string): void },
    next: () => void,
  ) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
  };

  return {
    name: "cross-origin-isolation",
    configureServer: (server) => void server.middlewares.use(setHeaders),
    configurePreviewServer: (server) => void server.middlewares.use(setHeaders),
  };
}

export default defineConfig({
  plugins: [vue(), libpgQueryBrowser(), crossOriginIsolation()],
  server: { port: 5174 },
  optimizeDeps: {
    exclude: ["@electric-sql/pglite", "libpg-query"],
  },
  assetsInclude: ["**/*.wasm"],
  worker: {
    format: "es",
    plugins: () => [libpgQueryBrowser()],
  },
  resolve: {
    alias: [
      {
        find: "@ts-safeql/generate",
        replacement: path.resolve(repoRoot, "packages/generate/index.ts"),
      },
      {
        find: "@ts-safeql/shared",
        replacement: path.resolve(repoRoot, "packages/shared/src/index.ts"),
      },
      {
        find: "@ts-safeql/sql-ast",
        replacement: path.resolve(repoRoot, "packages/ast-types/src/index.ts"),
      },
      { find: "postgres", replacement: path.resolve(rootDir, "src/shims/postgres.ts") },
      {
        find: /^libpg-query\/wasm\/libpg-query\.wasm$/,
        replacement: path.resolve(rootDir, "node_modules/libpg-query/wasm/libpg-query.wasm"),
      },
      { find: /^libpg-query$/, replacement: path.resolve(rootDir, "src/shims/libpg-query.ts") },
      { find: /^(node:)?path$/, replacement: path.resolve(rootDir, "src/shims/path-stub.ts") },
      // Redirect the whole `eslint` barrel (pulled in by @typescript-eslint/utils) to the
      // browser Linter build, avoiding the node-coupled ESLint class (fs globbing, glob-parent).
      { find: /^eslint$/, replacement: path.resolve(rootDir, "src/shims/eslint-browser.ts") },
      {
        find: /^eslint\/use-at-your-own-risk$/,
        replacement: path.resolve(rootDir, "src/shims/eslint-unsupported.ts"),
      },
      // The real check-sql rule blocks on synckit; in the browser we bridge to a worker
      // running PGlite via SharedArrayBuffer + Atomics (see src/shims/synckit.ts).
      { find: /^synckit$/, replacement: path.resolve(rootDir, "src/shims/synckit.ts") },
      // Node builtins the rule imports at module load but never calls on the lint path.
      { find: /^(node:)?fs$/, replacement: path.resolve(rootDir, "src/shims/node-empty.ts") },
      { find: /^(node:)?crypto$/, replacement: path.resolve(rootDir, "src/shims/node-crypto.ts") },
      { find: /^(node:)?module$/, replacement: path.resolve(rootDir, "src/shims/node-empty.ts") },
      { find: /^(node:)?url$/, replacement: path.resolve(rootDir, "src/shims/node-url.ts") },
      { find: /^(node:)?os$/, replacement: path.resolve(rootDir, "src/shims/node-os.ts") },
      { find: /^(node:)?util$/, replacement: path.resolve(rootDir, "src/shims/node-util.ts") },
    ],
  },
  build: {
    target: "esnext",
  },
});
