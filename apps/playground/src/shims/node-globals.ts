// ESLint / jiti / typescript-eslint reference node globals (`process`, `global`) at module
// load. Provide minimal browser polyfills before any of them is imported.
const nodeProcess = {
  // TypeScript checks `process.browser` to pick its browser sys instead of getNodeSystem
  // (which would call into a real filesystem at module load).
  browser: true,
  env: { NODE_ENV: "production" } as Record<string, string>,
  platform: "browser",
  arch: "wasm",
  argv: [] as string[],
  cwd: () => "/",
  version: "",
  versions: { node: "" } as Record<string, string>,
  nextTick: (callback: () => void) => queueMicrotask(callback),
  stdout: { write: () => true },
  stderr: { write: () => true },
};

const globals = globalThis as Record<string, unknown>;

if (globals.process === undefined) {
  globals.process = nodeProcess;
}

if (globals.global === undefined) {
  globals.global = globalThis;
}

// Some CJS deps reference these module globals; an unqualified read resolves to globalThis.
if (globals.__filename === undefined) {
  globals.__filename = "/index.js";
}

if (globals.__dirname === undefined) {
  globals.__dirname = "/";
}

export {};
