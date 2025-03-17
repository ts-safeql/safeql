export function isDefined<T>(value: T | null | undefined): value is NonNullable<T> {
  return value !== undefined && value !== null;
}

export function fmap<T, R>(v: T | null | undefined, predicate: (v: T) => R): R | null {
  if (!isDefined(v)) {
    return null;
  }

  return predicate(v);
}

export function validateOneOf<T>(value: unknown, possibilies: readonly T[]): T {
  const valueAsT = value as T;

  if (!possibilies.includes(valueAsT)) {
    throw new Error(
      `validation of validateOneOf failed. Expected "${value}" to be one of "${possibilies.join(
        ", ",
      )}"`,
    );
  }

  return valueAsT;
}

type GroupedBy<T, K> = K extends [infer K0, ...infer KR]
  ? Map<T[Extract<K0, keyof T>], GroupedBy<T, KR>>
  : T[];

export function groupBy<T, K extends Array<keyof T>>(
  objects: readonly T[],
  ...by: [...K]
): GroupedBy<T, K> {
  if (by.length === 0) {
    return objects as GroupedBy<T, K>;
  }

  const [k0, ...kr] = by;
  const topLevelGroups = new Map<T[K[0]], T[]>();
  for (const obj of objects) {
    const k = obj[k0];
    let arr = topLevelGroups.get(k);
    if (!arr) {
      arr = [];
      topLevelGroups.set(k, arr);
    }
    arr.push(obj);
  }
  return new Map(Array.from(topLevelGroups, ([k, v]) => [k, groupBy(v, ...kr)])) as GroupedBy<T, K>;
}

type NonEmptyArray<T> = readonly [T, ...ReadonlyArray<T>];
export function isNonEmpty<T>(array: ReadonlyArray<T> | undefined): array is NonEmptyArray<T> {
  return array !== undefined && array.length > 0;
}

export function objectKeys<T extends object>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[];
}

export function objectKeysNonEmpty<T extends object>(obj: T): [keyof T, ...(keyof T)[]] {
  const keys = objectKeys(obj);

  if (keys.length === 0) {
    throw new Error("expected non-empty object");
  }

  return keys as [keyof T, ...(keyof T)[]];
}

export function assertNever(caseType: never): never {
  throw new Error(`assertNever: ${caseType}`);
}

export async function getOrSetFromMapWithEnabled<T>(params: {
  shouldCache: boolean;
  map: Map<string, NoInfer<T>>;
  key: string;
  value: () => T | Promise<T>;
}) {
  return params.shouldCache ? getOrSetFromMap(params) : params.value();
}

export async function getOrSetFromMap<T>(params: {
  map: Map<string, T>;
  key: string;
  value: () => T | Promise<T>;
}) {
  const { map, key, value } = params;

  if (map.has(key)) {
    return map.get(key)!;
  }

  const val = await value();
  map.set(key, val);

  return val;
}

export function normalizeIndent<T extends string>(template: TemplateStringsArray, ...args: T[]): T {
  const fullString = template.reduce((accumulator, str, i) => {
    return accumulator + str + (args[i] || "");
  }, "");
  const lines = fullString.split("\n");
  const nonEmptyLines = lines.filter((line) => line.trim() !== "");
  if (nonEmptyLines.length === 0) {
    return "" as T;
  }
  const indent = nonEmptyLines[0].match(/^\s*/)?.[0];
  const normalized = nonEmptyLines.map((line) => line.replace(indent!, "")).join("\n");
  return normalized as T;
}
