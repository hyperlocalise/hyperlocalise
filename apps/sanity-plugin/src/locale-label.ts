import type {SanitySessionProject} from './hyperlocalise-client'

export function localeLabel(locale: string) {
  const tag = locale.trim()
  if (!tag) {
    return tag
  }

  try {
    const language =
      new Intl.DisplayNames(['en'], {type: 'language'}).of(new Intl.Locale(tag).language) ?? tag
    return `${language} (${tag})`
  } catch {
    return tag
  }
}

/** Source locale first, then project targets (deduped). Matches Canva `localeOptions`. */
export function translateToOptionsForProject(project: SanitySessionProject | null | undefined) {
  if (!project) {
    return []
  }

  const seen = new Set<string>()
  return [project.sourceLocale, ...project.targetLocales]
    .map((locale) => locale.trim())
    .filter((locale) => {
      if (!locale || seen.has(locale)) {
        return false
      }
      seen.add(locale)
      return true
    })
    .map((locale) => ({
      value: locale,
      label: localeLabel(locale),
    }))
}

export function defaultSelectedLocale(
  project: SanitySessionProject | null | undefined,
  current: string,
) {
  if (!project) {
    return ''
  }

  const locales = [project.sourceLocale, ...project.targetLocales]
    .map((locale) => locale.trim())
    .filter(Boolean)
  if (current && locales.includes(current)) {
    return current
  }
  return locales[0] ?? ''
}
