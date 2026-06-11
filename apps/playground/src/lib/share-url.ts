export interface PlaygroundState {
  schema: string;
  code: string;
  config?: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  // Build in chunks: per-byte string concatenation is O(n²) in some engines, and spreading the
  // whole array into fromCharCode can blow the call-stack on large payloads.
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(encoded: string): Uint8Array {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function pipeThrough(
  bytes: Uint8Array,
  transform: GenericTransformStream,
): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const supportsCompression = typeof CompressionStream !== "undefined";

// Deflate before Base64 so even multi-table schemas stay well within URL-length limits. Where the
// Compression Streams API is unavailable, fall back to uncompressed Base64; decode tries inflate
// first and falls back to raw, so either form round-trips.
export async function encodePlaygroundState(state: PlaygroundState): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(state));
  const bytes = supportsCompression
    ? await pipeThrough(json, new CompressionStream("deflate-raw"))
    : json;
  return bytesToBase64Url(bytes);
}

export async function decodePlaygroundState(encoded: string): Promise<PlaygroundState | null> {
  try {
    const bytes = base64UrlToBytes(encoded.trim());
    let jsonBytes = bytes;
    if (typeof DecompressionStream !== "undefined") {
      // The payload may be raw (encoded without compression support); fall back to it on failure.
      jsonBytes = await pipeThrough(bytes, new DecompressionStream("deflate-raw")).catch(
        () => bytes,
      );
    }
    const json = new TextDecoder().decode(jsonBytes);
    const parsed: unknown = JSON.parse(json);

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "schema" in parsed &&
      "code" in parsed &&
      typeof parsed.schema === "string" &&
      typeof parsed.code === "string"
    ) {
      const config =
        "config" in parsed && typeof parsed.config === "string" ? parsed.config : undefined;
      return { schema: parsed.schema, code: parsed.code, config };
    }
  } catch {
    return null;
  }

  return null;
}

export async function readPlaygroundStateFromUrl(): Promise<PlaygroundState | null> {
  const encoded = window.location.hash.replace(/^#/, "");
  if (!encoded) {
    return null;
  }

  return decodePlaygroundState(encoded);
}

export async function writePlaygroundStateToUrl(state: PlaygroundState): Promise<void> {
  const encoded = await encodePlaygroundState(state);
  const nextUrl = `${window.location.pathname}${window.location.search}#${encoded}`;
  const currentHash = window.location.hash.replace(/^#/, "");

  if (currentHash === encoded) {
    return;
  }

  window.history.replaceState(null, "", nextUrl);
}
