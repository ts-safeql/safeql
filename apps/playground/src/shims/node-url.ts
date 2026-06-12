// Stub for `node:url`. The rule's worker loader calls fileURLToPath to locate the worker
// file on disk; in the browser the worker is never loaded that way (synckit is shimmed).
export function fileURLToPath(url: string | URL): string {
  const value = String(url);
  // Extract the bare path from a file:// URL (e.g. "file:///foo" → "/foo"); pass through anything
  // that isn't a file URL unchanged.
  return value.startsWith("file:") ? new URL(value).pathname : value;
}

export function pathToFileURL(value: string): URL {
  return new URL(`file://${value}`);
}

export default { fileURLToPath, pathToFileURL };
