// @ts-expect-error Emscripten bundle has no types.
import PgQueryModule from "virtual:libpg-query-emscripten";
import wasmUrl from "libpg-query/wasm/libpg-query.wasm?url";

interface WasmModule {
  lengthBytesUTF8: (value: string) => number;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  stringToUTF8: (value: string, ptr: number, maxBytes: number) => void;
  UTF8ToString: (ptr: number) => string;
  _wasm_parse_query: (queryPtr: number) => number;
  _wasm_free_string: (ptr: number) => void;
}

let wasmModule: WasmModule | undefined;
let initPromise: Promise<void> | undefined;

// Lazy, self-clearing: a transient WASM load failure (network/CSP) clears the cached promise so
// the next call retries instead of failing permanently until a page reload.
function init(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }
  const promise = PgQueryModule({
    locateFile: (path: string) => (path.endsWith(".wasm") ? wasmUrl : path),
  })
    .then((module: WasmModule) => {
      wasmModule = module;
    })
    .catch((error: unknown) => {
      initPromise = undefined;
      throw error;
    });
  initPromise = promise;
  return promise;
}

function ensureLoaded() {
  if (!wasmModule) {
    throw new Error("WASM module not initialized. Call `loadModule()` first.");
  }
}

export async function loadModule() {
  if (!wasmModule) {
    await init();
  }
}

function awaitInit<T extends (...args: never[]) => unknown>(fn: T) {
  return (async (...args: Parameters<T>) => {
    await init();
    return fn(...args);
  }) as T;
}

function stringToPtr(str: string) {
  ensureLoaded();
  const len = wasmModule!.lengthBytesUTF8(str) + 1;
  const ptr = wasmModule!._malloc(len);
  try {
    wasmModule!.stringToUTF8(str, ptr, len);
    return ptr;
  } catch (error) {
    wasmModule!._free(ptr);
    throw error;
  }
}

function ptrToString(ptr: number) {
  ensureLoaded();
  return wasmModule!.UTF8ToString(ptr);
}

export const parse = awaitInit(async (query: string) => {
  const queryPtr = stringToPtr(query);
  let resultPtr = 0;
  try {
    resultPtr = wasmModule!._wasm_parse_query(queryPtr);
    if (resultPtr === 0) {
      throw new Error("libpg-query: parse returned a null pointer");
    }
    const resultStr = ptrToString(resultPtr);
    if (
      resultStr.startsWith("syntax error") ||
      resultStr.startsWith("deparse error") ||
      resultStr.startsWith("ERROR")
    ) {
      throw new Error(resultStr);
    }
    return JSON.parse(resultStr);
  } finally {
    wasmModule!._free(queryPtr);
    if (resultPtr) {
      wasmModule!._wasm_free_string(resultPtr);
    }
  }
});

export function parseSync(query: string) {
  const queryPtr = stringToPtr(query);
  let resultPtr = 0;
  try {
    resultPtr = wasmModule!._wasm_parse_query(queryPtr);
    if (resultPtr === 0) {
      throw new Error("libpg-query: parse returned a null pointer");
    }
    const resultStr = ptrToString(resultPtr);
    if (
      resultStr.startsWith("syntax error") ||
      resultStr.startsWith("deparse error") ||
      resultStr.startsWith("ERROR")
    ) {
      throw new Error(resultStr);
    }
    return JSON.parse(resultStr);
  } finally {
    wasmModule!._free(queryPtr);
    if (resultPtr) {
      wasmModule!._wasm_free_string(resultPtr);
    }
  }
}
