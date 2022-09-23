const memoized = new Map();

export function memoize<T>(params: { key: string; value: () => T }): T {
  const { key, value } = params;

  if (memoized.has(key)) {
    return memoized.get(key);
  }

  const result = value();

  memoized.set(key, result);

  return result;
}
