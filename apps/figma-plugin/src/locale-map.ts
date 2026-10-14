export function localeKey(locale: string): string {
  return locale.trim().toLowerCase();
}

function canonicalizeLocale(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (typeof Intl === "undefined" || typeof Intl.getCanonicalLocales !== "function") {
    return trimmed;
  }
  try {
    const [canonical] = Intl.getCanonicalLocales(trimmed);
    return canonical ?? null;
  } catch {
    return null;
  }
}

function languageSubtag(locale: string): string | null {
  const canonical = canonicalizeLocale(locale);
  if (!canonical) {
    return null;
  }
  try {
    return new Intl.Locale(canonical).language;
  } catch {
    return null;
  }
}

function localeRegion(locale: string): string | null {
  const canonical = canonicalizeLocale(locale);
  if (!canonical) {
    return null;
  }
  try {
    return new Intl.Locale(canonical).region ?? null;
  } catch {
    return null;
  }
}

function hasNonEmptyTranslations(translations: Record<string, string>): boolean {
  return Object.values(translations).some((value) => value.trim().length > 0);
}

export function localesMatchForPick(requested: string, candidate: string): boolean {
  const a = requested.trim();
  const b = candidate.trim();
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  if (localeKey(a) === localeKey(b)) {
    return true;
  }
  const canonicalA = canonicalizeLocale(a);
  const canonicalB = canonicalizeLocale(b);
  if (canonicalA && canonicalB && canonicalA === canonicalB) {
    return true;
  }
  const langA = languageSubtag(a);
  const langB = languageSubtag(b);
  if (!langA || !langB || langA !== langB) {
    return false;
  }
  const regionA = localeRegion(a);
  const regionB = localeRegion(b);
  if (!regionA || !regionB) {
    return true;
  }
  return regionA === regionB;
}

export function pickTranslationsForLocale(
  translationsByLocale: Record<string, Record<string, string>>,
  locale: string,
): Record<string, string> | undefined {
  const trimmed = locale.trim();
  if (!trimmed) {
    return undefined;
  }
  if (translationsByLocale[trimmed] && hasNonEmptyTranslations(translationsByLocale[trimmed]!)) {
    return translationsByLocale[trimmed];
  }
  const canonical = canonicalizeLocale(trimmed);
  if (
    canonical &&
    translationsByLocale[canonical] &&
    hasNonEmptyTranslations(translationsByLocale[canonical]!)
  ) {
    return translationsByLocale[canonical];
  }
  const targetKey = localeKey(trimmed);
  const caseMatch = Object.entries(translationsByLocale).find(
    ([entryLocale]) => localeKey(entryLocale) === targetKey,
  );
  if (caseMatch && hasNonEmptyTranslations(caseMatch[1])) {
    return caseMatch[1];
  }

  const requestedLanguage = languageSubtag(trimmed);
  if (!requestedLanguage) {
    return undefined;
  }
  const languageMatches = Object.entries(translationsByLocale).filter(
    ([entryLocale, translations]) => {
      if (!hasNonEmptyTranslations(translations)) {
        return false;
      }
      return localesMatchForPick(trimmed, entryLocale);
    },
  );
  if (languageMatches.length === 1) {
    return languageMatches[0]![1];
  }

  return undefined;
}
