export function noNulls<T>(items: (T | null | undefined)[]): T[] {
  return items.filter((x): x is T => x != null);
}
