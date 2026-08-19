export function normalizeInverse(values: readonly number[]): readonly number[] {
  if (values.length === 0) return [];
  if (values.some((value) => !Number.isFinite(value)))
    throw new TypeError("Only finite values can be normalized");
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) return values.map(() => 100);
  return values.map(
    (value) => 100 * (1 - (value - minimum) / (maximum - minimum)),
  );
}
