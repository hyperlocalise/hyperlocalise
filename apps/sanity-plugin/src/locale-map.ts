export function localeKey(locale: string): string {
  return locale.trim().toLowerCase()
}

function canonicalizeLocale(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }
  if (typeof Intl === 'undefined' || typeof Intl.getCanonicalLocales !== 'function') {
    return trimmed
  }
  try {
    const [canonical] = Intl.getCanonicalLocales(trimmed)
    return canonical ?? null
  } catch {
    return null
  }
}

/** True when two tags are the same project locale (canonical BCP-47, case-insensitive). */
export function projectLocalesMatch(a: string, b: string): boolean {
  const trimmedA = a.trim()
  const trimmedB = b.trim()
  if (!trimmedA || !trimmedB) {
    return false
  }
  if (trimmedA === trimmedB) {
    return true
  }
  if (localeKey(trimmedA) === localeKey(trimmedB)) {
    return true
  }
  const canonicalA = canonicalizeLocale(trimmedA)
  const canonicalB = canonicalizeLocale(trimmedB)
  if (canonicalA && canonicalB && canonicalA === canonicalB) {
    return true
  }
  return false
}

/** @deprecated Use projectLocalesMatch. */
export const localesMatchForPick = projectLocalesMatch

function hasNonEmptyTranslations(translations: Record<string, string>): boolean {
  return Object.values(translations).some((value) => value.trim().length > 0)
}

export function pickTranslationsForLocale(
  translationsByLocale: Record<string, Record<string, string>>,
  locale: string,
): Record<string, string> | undefined {
  const trimmed = locale.trim()
  if (!trimmed) {
    return undefined
  }
  const direct = translationsByLocale[trimmed]
  if (direct && hasNonEmptyTranslations(direct)) {
    return direct
  }
  const canonical = canonicalizeLocale(trimmed)
  if (canonical) {
    const canonicalMatch = translationsByLocale[canonical]
    if (canonicalMatch && hasNonEmptyTranslations(canonicalMatch)) {
      return canonicalMatch
    }
  }
  const targetKey = localeKey(trimmed)
  const caseMatch = Object.entries(translationsByLocale).find(
    ([entryLocale]) => localeKey(entryLocale) === targetKey,
  )
  if (caseMatch && hasNonEmptyTranslations(caseMatch[1])) {
    return caseMatch[1]
  }

  return undefined
}
