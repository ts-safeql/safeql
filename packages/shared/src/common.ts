export function isDefined<T>(value: T | null | undefined): value is NonNullable<T> {
  return value !== undefined && value !== null;
}

export function withDefault<T>(value: T | null | undefined, fallback: T): T {
  return isDefined(value) ? value : fallback;
}

export function toPascalCase(value: string) {
  return `${value}`
    .replace(new RegExp(/[-_]+/, "g"), " ")
    .replace(new RegExp(/[^\w\s]/, "g"), "")
    .replace(
      new RegExp(/\s+(.)(\w+)/, "g"),
      ($1, $2, $3) => `${$2.toUpperCase() + $3.toLowerCase()}`
    )
    .replace(new RegExp(/\s/, "g"), "")
    .replace(new RegExp(/\w/), (s) => s.toUpperCase());
}

export function throwOnNullish<T>(value: T | null | undefined): T {
  if (!isDefined(value)) {
    throw new Error(`expected non-null, received ${value}`);
  }

  return value;
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
        ", "
      )}"`
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

interface Primitives {
  string: string;
  boolean: boolean;
  number: number;
}

export function assertPrimitive<Type extends "string" | "boolean" | "number">(
  value: unknown,
  type: Type
): Primitives[Type] {
  if (typeof value !== type) {
    throw new Error(`Expected ${type} but got ${typeof value}`);
  }

  return value as Primitives[Type];
}

export function pick<T, K extends keyof T>(object: T, keys: K[]) {
  return keys.reduce((obj, key) => {
    if (object && key in object) {
      obj[key] = object[key];
    }
    return obj;
  }, {} as { [key in K]: T[key] });
}

type NonEmptyArray<T> = readonly [T, ...ReadonlyArray<T>];
export function isNonEmpty<T>(array: ReadonlyArray<T> | undefined): array is NonEmptyArray<T> {
  return array !== undefined && array.length > 0;
}
