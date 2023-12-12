export type RecursiveOmit<T, K extends string | number | symbol> = T extends infer O
  ? O extends Array<infer U>
    ? RecursiveOmitArray<U, K>[]
    : O extends object
    ? {
        [P in Exclude<keyof O, K>]: O[P] extends infer R
          ? R extends object
            ? RecursiveOmit<R, K>
            : O[P]
          : never;
      }
    : O
  : never;

type RecursiveOmitArray<T, K extends string | number | symbol> = T extends infer O
  ? O extends object
    ? RecursiveOmit<O, K>
    : O
  : never;

export function deepOmit<T extends object, K extends string | number | symbol>(
  obj: T,
  keyToOmit: K
): RecursiveOmit<T, K> {
  if (Array.isArray(obj)) {
    return obj.map((v) => deepOmit(v, keyToOmit)) as RecursiveOmit<T, K>;
  }

  return Object.fromEntries(
    Object.entries(obj)
      .filter(([k]) => k !== keyToOmit)
      .map(([k, v]) => [k, typeof v === "object" ? deepOmit(v, keyToOmit) : v])
  ) as RecursiveOmit<T, K>;
}
