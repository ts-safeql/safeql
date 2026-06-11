// Stub for `crypto`. Only used by the rule's migrations path (sha1 of the migrations dir),
// which the browser playground never reaches.
const hasher = {
  update: () => hasher,
  digest: () => "00000000",
};

const cryptoLike = {
  createHash: () => hasher,
  // Delegate to the Web Crypto API so distinct calls get distinct ids (the constant fallback is
  // only for environments without it).
  randomUUID: () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : // Fallback for environments without Web Crypto — not cryptographically strong, but unique
        // enough for the rule's cache keys (which is all this shim feeds).
        "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
          const random = (Math.random() * 16) | 0;
          const value = char === "x" ? random : (random & 0x3) | 0x8;
          return value.toString(16);
        }),
};

export const createHash = cryptoLike.createHash;
export const randomUUID = cryptoLike.randomUUID;
export default cryptoLike;
