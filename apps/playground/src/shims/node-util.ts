// Minimal `util` polyfill.
type Callback = (error: unknown, value?: unknown) => void;

export function promisify<T>(fn: (...args: unknown[]) => void): (...args: unknown[]) => Promise<T> {
  return (...args: unknown[]) =>
    new Promise<T>((resolve, reject) => {
      fn(...args, ((error: unknown, value: unknown) => {
        if (error) reject(error);
        else resolve(value as T);
      }) as Callback);
    });
}

export function inherits(ctor: { prototype: object }, superCtor: { prototype: object }): void {
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
}

export function inspect(value: unknown): string {
  return String(value);
}

export function format(...args: unknown[]): string {
  return args.map((arg) => (typeof arg === "string" ? arg : inspect(arg))).join(" ");
}

export const TextEncoder = globalThis.TextEncoder;
export const TextDecoder = globalThis.TextDecoder;
export const types = { isUint8Array: (value: unknown) => value instanceof Uint8Array };

export default { promisify, inherits, inspect, format, TextEncoder, TextDecoder, types };
