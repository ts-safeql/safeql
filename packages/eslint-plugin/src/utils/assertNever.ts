export function assertNever(x: never): never {
  throw new Error(`Discriminated union failed. Expected never, got ${x}`);
}
