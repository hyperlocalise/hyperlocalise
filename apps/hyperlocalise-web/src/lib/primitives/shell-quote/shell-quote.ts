/** Wrap a value for safe use inside a single-quoted POSIX shell argument. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
