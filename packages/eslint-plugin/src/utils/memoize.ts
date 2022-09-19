const memoized = new Map();

export function memoize<T>(params: {
  name: string;
  prefix: string;
  expiry: number;
  value: () => T;
}): T {
  const { name, prefix, expiry, value } = params;
  const key = `${prefix}-${name}`;

  if (memoized.has(key)) {
    const { timestamp, value } = memoized.get(key);

    if (timestamp + expiry > Date.now()) {
      return value;
    }
  }

  const result = value();

  memoized.set(key, {
    timestamp: Date.now(),
    value: result,
  });

  return result;
}
