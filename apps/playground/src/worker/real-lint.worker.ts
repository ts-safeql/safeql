import "../shims/node-globals";
import { installGenerateBridge } from "../shims/synckit";
import { lintWithRealRule, type EngineDiagnostic } from "../lib/eslint-engine";
import type { PlaygroundConfig } from "../lib/playground-config";

// Runs the real check-sql rule. When the rule asks `generate` for a query, post the request to
// the main thread (which relays it to the DB worker) and block on Atomics.wait until the DB
// worker writes the result into the shared buffer.
interface InitMessage {
  type: "init";
  controlSab: SharedArrayBuffer;
  dataSab: SharedArrayBuffer;
}

interface LintMessage {
  type: "lint";
  id: number;
  code: string;
  schema: string;
  config: PlaygroundConfig;
}

// Generous ceiling for a whole lint run — covers first-call PGlite WASM init + schema load while
// bounding a stuck DB worker. It's a per-run budget shared across every query in the file (set in
// runLint), so a file with many queries can't block the worker for N × the timeout.
const GENERATE_TIMEOUT_MS = 30_000;

let control: Int32Array | undefined;
let data: Uint8Array | undefined;
let currentSchema = "";
let requestSeq = 0;
let lintDeadline = 0;

function timedOutResult(): string {
  return JSON.stringify({
    _tag: "Left",
    left: { _tag: "InternalError", message: "Timed out waiting for the database worker" },
  });
}

installGenerateBridge((args) => {
  if (control === undefined || data === undefined) {
    // Unreachable in practice (init is processed before any lint), but surface it as an error
    // rather than a fake-empty success that could mask an ordering bug.
    return JSON.stringify({
      _tag: "Left",
      left: { _tag: "InternalError", message: "Generate bridge not initialized" },
    });
  }

  // Keep seq within Int32Array's positive range (it's stored into control[0]) and never 0, which
  // is the "no result yet" sentinel — so it stays correct past ~2³¹ generate calls in a session.
  requestSeq = (requestSeq % 0x7fffffff) + 1;
  const seq = requestSeq;
  self.postMessage({ type: "generate-request", seq, schema: currentSchema, request: args[0] });

  // control[0] holds the seq of the latest result the DB worker has written. Wait until it equals
  // ours — bounding each wait so a stuck worker can't hang us, and ignoring a late result from a
  // previously timed-out request (whose seq won't match) instead of reading its stale bytes.
  for (;;) {
    const written = Atomics.load(control, 0);
    if (written === seq) {
      const length = Atomics.load(control, 1);
      // .slice() copies out of the SharedArrayBuffer — TextDecoder rejects shared views.
      return new TextDecoder().decode(data.slice(0, length));
    }
    const remaining = lintDeadline - Date.now();
    if (remaining <= 0 || Atomics.wait(control, 0, written, remaining) === "timed-out") {
      return timedOutResult();
    }
  }
});

function runLint(message: LintMessage): void {
  currentSchema = message.schema;
  // One budget for the whole run, shared by every generate call the rule makes for this file.
  lintDeadline = Date.now() + GENERATE_TIMEOUT_MS;

  try {
    const diagnostics: EngineDiagnostic[] = lintWithRealRule({
      code: message.code,
      databaseUrl: "postgres://postgres:postgres@localhost:5432/playground",
      config: message.config,
    });
    self.postMessage({ type: "result", id: message.id, diagnostics });
  } catch (error) {
    self.postMessage({
      type: "error",
      id: message.id,
      error: error instanceof Error ? error.message : `${error}`,
    });
  }
}

self.onmessage = (event: MessageEvent<InitMessage | LintMessage>) => {
  const message = event.data;
  if (message.type === "init") {
    control = new Int32Array(message.controlSab);
    data = new Uint8Array(message.dataSab);
    return;
  }
  runLint(message);
};
