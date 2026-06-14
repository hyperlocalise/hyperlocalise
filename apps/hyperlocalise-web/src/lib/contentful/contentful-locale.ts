export function normalizeContentfulLocaleTag(locale: string) {
  return locale.trim().replace(/_/g, "-").toLowerCase();
}

export function contentfulLocaleLanguage(locale: string) {
  return normalizeContentfulLocaleTag(locale).split("-")[0] ?? "";
}

function localeSpecificity(locale: string) {
  return normalizeContentfulLocaleTag(locale).split("-").length;
}

export function resolveContentfulLocaleKey(
  preferredLocale: string,
  availableLocales: readonly string[],
  options: { defaultLocale?: string | null } = {},
): string | null {
  const available = [...new Set(availableLocales.filter((locale) => locale.trim().length > 0))];
  if (available.length === 0) {
    return null;
  }

  const normalizedPreferred = normalizeContentfulLocaleTag(preferredLocale);
  for (const locale of available) {
    if (normalizeContentfulLocaleTag(locale) === normalizedPreferred) {
      return locale;
    }
  }

  const preferredLanguage = contentfulLocaleLanguage(preferredLocale);
  const languageMatches = available.filter(
    (locale) => contentfulLocaleLanguage(locale) === preferredLanguage,
  );
  if (languageMatches.length === 1) {
    return languageMatches[0] ?? null;
  }
  if (languageMatches.length > 1) {
    const defaultLocale = options.defaultLocale;
    if (defaultLocale) {
      const defaultMatch = languageMatches.find(
        (locale) =>
          normalizeContentfulLocaleTag(locale) === normalizeContentfulLocaleTag(defaultLocale),
      );
      if (defaultMatch) {
        return defaultMatch;
      }
    }

    return (
      [...languageMatches].sort(
        (left, right) => localeSpecificity(right) - localeSpecificity(left),
      )[0] ?? null
    );
  }

  return null;
}

export function collectEntryLocaleKeys(entry: {
  fields: Record<string, Record<string, unknown> | undefined>;
}) {
  const localeKeys = new Set<string>();
  for (const fieldValues of Object.values(entry.fields)) {
    if (!fieldValues) {
      continue;
    }
    for (const locale of Object.keys(fieldValues)) {
      localeKeys.add(locale);
    }
  }
  return [...localeKeys];
}

export function resolveContentfulLocaleKeys(input: {
  preferredLocales: readonly string[];
  spaceLocaleCodes: readonly string[];
  entryLocaleKeys?: readonly string[];
  defaultLocale?: string | null;
}) {
  const candidates = [...new Set([...input.spaceLocaleCodes, ...(input.entryLocaleKeys ?? [])])];

  return input.preferredLocales.map(
    (preferredLocale) =>
      resolveContentfulLocaleKey(preferredLocale, candidates, {
        defaultLocale: input.defaultLocale,
      }) ?? preferredLocale,
  );
}

export function resolveContentfulSourceLocale(input: {
  preferredSourceLocale: string;
  spaceLocaleCodes: readonly string[];
  entryLocaleKeys?: readonly string[];
  defaultLocale?: string | null;
}) {
  const candidates = [...new Set([...input.spaceLocaleCodes, ...(input.entryLocaleKeys ?? [])])];

  return (
    resolveContentfulLocaleKey(input.preferredSourceLocale, candidates, {
      defaultLocale: input.defaultLocale,
    }) ?? input.preferredSourceLocale
  );
}
