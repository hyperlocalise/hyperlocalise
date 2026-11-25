import type { OtaManifest } from "./manifest";

function normalize(locale: string): string {
  return locale.replaceAll("_", "-").toLowerCase();
}

function language(locale: string): string {
  return normalize(locale).split("-")[0] ?? "";
}

/**
 * Finds the distribution locale to use for an app locale:
 * the manifest's `language_mapping`, then an exact match ignoring case and
 * `_`/`-`, then the same language (`fr` → `fr-FR`, `fr-CA` → `fr-FR`).
 */
export function resolveLocale(manifest: OtaManifest, requested: string): string | undefined {
  const languages = manifest.languages;
  const mapped = manifest.language_mapping[requested];
  if (mapped && languages.includes(mapped)) {
    return mapped;
  }

  const wanted = normalize(requested);
  const exact = languages.find((candidate) => normalize(candidate) === wanted);
  if (exact) {
    return exact;
  }

  const wantedLanguage = language(requested);
  const sameLanguage = languages.filter((candidate) => language(candidate) === wantedLanguage);
  // Prefer the bare language or its "default" region (fr → fr-FR, de → de-DE).
  return (
    sameLanguage.find((candidate) => normalize(candidate) === wantedLanguage) ??
    sameLanguage.find(
      (candidate) => normalize(candidate) === `${wantedLanguage}-${wantedLanguage}`,
    ) ??
    sameLanguage[0]
  );
}
