export function uniqueLocales(locales: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const locale of locales) {
    const trimmed = locale.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    unique.push(trimmed);
  }

  return unique;
}
