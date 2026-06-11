// Browser replacement for `synckit`. The real plugin uses synckit to call the async
// `generate` worker synchronously from inside the (sync) ESLint rule. In the browser we
// bridge to a worker via SharedArrayBuffer + Atomics — see installGenerateBridge below.
//
// Contract: the rule reads the worker result via `flow(generateSync, E.chain(J.parse), ...)`,
// so generateSync must return an fp-ts Either *object* whose Right holds the JSON string of
// the inner Either<WorkerError, GenerateResult> (mirroring the worker's `J.stringify(result)`).

type SyncFn = (...args: unknown[]) => unknown;

// Inner Either<WorkerError, GenerateResult>, JSON-stringified. Empty = a query with no columns.
const EMPTY_INNER = JSON.stringify({
  _tag: "Right",
  right: { output: null, unknownColumns: [], stmt: {}, query: { text: "", sourcemaps: [] } },
});

// Returns the inner Either JSON string for the given worker args (or undefined to fall back).
let bridge: ((args: unknown[]) => string) | undefined;

export function installGenerateBridge(fn: (args: unknown[]) => string): void {
  bridge = fn;
}

export function createSyncFn<T extends SyncFn>(): T {
  return ((...args: unknown[]) => {
    const innerJson = bridge ? bridge(args) : EMPTY_INNER;
    return { _tag: "Right", right: innerJson };
  }) as T;
}

export function runAsWorker(): void {
  // No-op: the worker body never executes in the browser.
}
