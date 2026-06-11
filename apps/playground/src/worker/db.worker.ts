import { createGenerator, type GenerateParams } from "@ts-safeql/generate";
import { PGlite } from "@electric-sql/pglite";
import { either } from "fp-ts";
import { loadModule as loadLibPgQuery } from "libpg-query";
import { createPgliteSql } from "../lib/pglite-sql";

// Runs the real PGlite-backed `generate` and hands results back to the (blocked) lint worker
// through a SharedArrayBuffer: write the JSON, set [1]=length and [0]=1, then notify.
interface InitMessage {
  type: "init";
  controlSab: SharedArrayBuffer;
  dataSab: SharedArrayBuffer;
}

interface GenerateMessage {
  type: "generate";
  seq: number;
  schema: string;
  request: {
    query: GenerateParams["query"];
    target?: { fieldTransform?: GenerateParams["fieldTransform"] };
    connection?: { overrides?: GenerateParams["overrides"] };
  };
}

const RESET_SCHEMA_SQL = `
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
`;

const generator = createGenerator();

let control: Int32Array | undefined;
let data: Uint8Array | undefined;
let db: PGlite | undefined;
let initPromise: Promise<PGlite> | undefined;
let lastSchema = "";
let schemaVersion = 0;

async function getDb(): Promise<PGlite> {
  initPromise ??= PGlite.create();
  try {
    db = await initPromise;
    await db.waitReady;
  } catch (error) {
    // Don't cache a failed init (create or waitReady) — let the next request retry.
    initPromise = undefined;
    throw error;
  }
  return db;
}

async function ensureSchema(schema: string): Promise<PGlite> {
  const database = await getDb();
  if (schema === lastSchema) {
    return database;
  }
  await database.exec(RESET_SCHEMA_SQL);
  // The DB is now empty; bump the version and clear lastSchema first so that if exec(schema)
  // throws, a later request with the same schema still reloads instead of running against an
  // empty database. Drop the previous generation's cache so it doesn't grow per schema edit.
  lastSchema = "";
  generator.dropCacheKey(`playground:${schemaVersion}`);
  schemaVersion += 1;
  if (schema.trim()) {
    await database.exec(schema);
  }
  lastSchema = schema;
  return database;
}

function writeResult(innerJson: string, seq: number): void {
  if (control === undefined || data === undefined) {
    return;
  }
  let bytes = new TextEncoder().encode(innerJson);
  // The result has to fit the shared buffer. Truncating would corrupt the JSON the lint worker
  // parses, so on overflow send a well-formed error instead of garbage.
  if (bytes.length > data.length) {
    bytes = new TextEncoder().encode(
      JSON.stringify({
        _tag: "Left",
        left: { _tag: "InternalError", message: "Result exceeds the playground's transfer buffer" },
      }),
    );
  }
  data.set(bytes);
  Atomics.store(control, 1, bytes.length);
  // Publish length before seq: the lint worker keys on control[0] === its seq, so by the time it
  // sees the seq the length and bytes are already in place.
  Atomics.store(control, 0, seq);
  Atomics.notify(control, 0);
}

async function handleGenerate(message: GenerateMessage): Promise<void> {
  try {
    // Call inline (not a cached module-level promise) so libpg-query's self-clearing init can
    // retry a transient WASM load failure instead of being stuck on a permanently rejected one.
    await loadLibPgQuery();
    const database = await ensureSchema(message.schema);
    const sql = createPgliteSql(database);
    const result = await generator.generate({
      sql,
      query: message.request.query,
      cacheKey: `playground:${schemaVersion}`,
      fieldTransform: message.request.target?.fieldTransform,
      overrides: message.request.connection?.overrides,
    });

    const inner = either.isLeft(result)
      ? { _tag: "Left", left: result.left }
      : { _tag: "Right", right: result.right };
    writeResult(JSON.stringify(inner), message.seq);
  } catch (error) {
    writeResult(
      JSON.stringify({
        _tag: "Left",
        left: {
          _tag: "InternalError",
          message: error instanceof Error ? error.message : `${error}`,
        },
      }),
      message.seq,
    );
  }
}

// The lint worker blocks on Atomics until each result is written, so only one request is ever
// outstanding. We still chain them to guarantee a single writer to the shared buffer regardless.
let queue: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<InitMessage | GenerateMessage>) => {
  const message = event.data;
  if (message.type === "init") {
    control = new Int32Array(message.controlSab);
    data = new Uint8Array(message.dataSab);
    return;
  }
  // handleGenerate writes its own errors to the buffer; the catch only keeps an unexpected
  // rejection from poisoning the queue and dropping every later request.
  queue = queue.then(() => handleGenerate(message)).catch(() => {});
};
