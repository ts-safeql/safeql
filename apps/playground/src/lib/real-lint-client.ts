import type { EngineDiagnostic } from "./eslint-engine";
import type { PlaygroundConfig } from "./playground-config";

// Wires the lint worker (real check-sql rule, blocks on Atomics) to the DB worker (PGlite +
// generate) through shared buffers, relaying the lint worker's generate requests to the DB
// worker while the lint worker is blocked.
const CONTROL_LENGTH = 2; // Int32: [latestResultSeq, byteLength]
const DATA_BYTES = 8 * 1024 * 1024;

interface PendingLint {
  resolve: (diagnostics: EngineDiagnostic[]) => void;
  reject: (error: Error) => void;
}

let lintWorker: Worker | undefined;
let dbWorker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, PendingLint>();

// Tear the pipeline down on a worker crash: reject everything in flight and drop the cached
// workers so the next lintReal rebuilds a fresh pair instead of posting to a dead worker.
function teardown(reason: string): void {
  for (const entry of pending.values()) {
    entry.reject(new Error(reason));
  }
  pending.clear();
  lintWorker?.terminate();
  dbWorker?.terminate();
  lintWorker = undefined;
  dbWorker = undefined;
}

function ensureWorkers(): { lint: Worker } {
  if (lintWorker !== undefined) {
    return { lint: lintWorker };
  }

  // SharedArrayBuffer only exists under cross-origin isolation. Fail with a clear message rather
  // than a cryptic ReferenceError when a deploy is missing the COOP/COEP headers (see vercel.json
  // / public/_headers).
  if (typeof SharedArrayBuffer === "undefined" || !globalThis.crossOriginIsolated) {
    throw new Error(
      "SafeQL playground requires cross-origin isolation. The host must send " +
        "Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp.",
    );
  }

  const controlSab = new SharedArrayBuffer(CONTROL_LENGTH * Int32Array.BYTES_PER_ELEMENT);
  const dataSab = new SharedArrayBuffer(DATA_BYTES);

  const db = new Worker(new URL("../worker/db.worker.ts", import.meta.url), { type: "module" });
  const lint = new Worker(new URL("../worker/real-lint.worker.ts", import.meta.url), {
    type: "module",
  });

  // Attach handlers before init so an early message can't be missed.
  lint.onmessage = (event: MessageEvent) => {
    const message = event.data;
    if (message.type === "generate-request") {
      db.postMessage({
        type: "generate",
        seq: message.seq,
        schema: message.schema,
        request: message.request,
      });
      return;
    }

    const entry = pending.get(message.id);
    if (entry === undefined) {
      return;
    }
    pending.delete(message.id);

    if (message.type === "result") {
      entry.resolve(message.diagnostics);
    } else {
      entry.reject(new Error(message.error ?? `Unknown worker error: ${JSON.stringify(message)}`));
    }
  };

  // Either worker crashing leaves the other half-wired and the lint worker possibly blocked on
  // Atomics; tear the whole pipeline down so the next request starts clean.
  lint.onerror = (event) => teardown(event.message || "Lint worker crashed");
  db.onerror = (event) => teardown(event.message || "DB worker crashed");

  db.postMessage({ type: "init", controlSab, dataSab });
  lint.postMessage({ type: "init", controlSab, dataSab });

  lintWorker = lint;
  dbWorker = db;
  return { lint };
}

export function lintReal(input: {
  code: string;
  schema: string;
  config: PlaygroundConfig;
}): Promise<EngineDiagnostic[]> {
  const { lint } = ensureWorkers();
  const id = nextId++;

  return new Promise<EngineDiagnostic[]>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    lint.postMessage({
      type: "lint",
      id,
      code: input.code,
      schema: input.schema,
      config: input.config,
    });
  });
}
