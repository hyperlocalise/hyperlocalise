export function localeKey(locale: string): string {
  return locale.trim().toLowerCase();
}

export function pickTranslationsForLocale(
  translationsByLocale: Record<string, Record<string, string>>,
  locale: string,
): Record<string, string> | undefined {
  const trimmed = locale.trim();
  if (!trimmed) {
    return undefined;
  }
  if (translationsByLocale[trimmed]) {
    return translationsByLocale[trimmed];
  }
  const targetKey = localeKey(trimmed);
  const match = Object.entries(translationsByLocale).find(
    ([entryLocale]) => localeKey(entryLocale) === targetKey,
  );
  return match?.[1];
}
