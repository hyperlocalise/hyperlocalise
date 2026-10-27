import { enabledLanguages, type HyperlocaliseLanguage } from "./config";
import type { SanitySessionProject } from "./hyperlocalise-client";
import { projectLocalesMatch } from "./locale-map";

export function localeLabel(locale: string) {
  const tag = locale.trim();
  if (!tag) {
    return tag;
  }

  try {
    const language =
      new Intl.DisplayNames(["en"], { type: "language" }).of(new Intl.Locale(tag).language) ?? tag;
    return `${language} (${tag})`;
  } catch {
    return tag;
  }
}

export function translateToOptionsForProject(
  project: SanitySessionProject | null | undefined,
  languages: HyperlocaliseLanguage[] = [],
) {
  if (!project) {
    return [];
  }

  const enabled = enabledLanguages(languages);
  if (enabled.length > 0) {
    return enabled
      .filter(
        (language) =>
          !projectLocalesMatch(language.id, project.sourceLocale) &&
          project.targetLocales.some((locale) => projectLocalesMatch(locale, language.id)),
      )
      .map((language) => ({
        value: language.id,
        label: language.title,
      }));
  }

  const seen = new Set<string>();
  return project.targetLocales
    .map((locale) => locale.trim())
    .filter((locale) => {
      if (!locale || seen.has(locale) || projectLocalesMatch(locale, project.sourceLocale)) {
        return false;
      }
      seen.add(locale);
      return true;
    })
    .map((locale) => ({
      value: locale,
      label: localeLabel(locale),
    }));
}

export function defaultSelectedLocale(
  project: SanitySessionProject | null | undefined,
  current: string,
  languages: HyperlocaliseLanguage[] = [],
) {
  const options = translateToOptionsForProject(project, languages);
  if (current && options.some((option) => option.value === current)) {
    return current;
  }
  return options[0]?.value ?? "";
}
