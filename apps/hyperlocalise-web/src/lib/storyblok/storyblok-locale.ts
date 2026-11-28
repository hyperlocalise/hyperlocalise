/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { canonicalizeLocale } from "@/lib/i18n/locales";

import type { StoryblokLanguage } from "./types";

/**
 * Storyblok language codes are free-form (`de`, `pt-br`, `es_co`). Compare
 * them as BCP 47 tags so `pt-br` matches project locale `pt-BR`.
 */
export function normalizeStoryblokLanguageCode(code: string): string {
  const dashed = code.trim().replace(/_/g, "-");
  return canonicalizeLocale(dashed) ?? dashed.toLowerCase();
}

function languageOf(tag: string): string {
  return tag.split("-")[0]?.toLowerCase() ?? "";
}

export function resolveStoryblokLanguage(
  projectLocale: string,
  languages: readonly StoryblokLanguage[],
): StoryblokLanguage | null {
  const normalized = normalizeStoryblokLanguageCode(projectLocale);
  const exact = languages.find(
    (language) => normalizeStoryblokLanguageCode(language.code) === normalized,
  );
  if (exact) {
    return exact;
  }
  const language = languageOf(normalized);
  if (!language) {
    return null;
  }
  const sameLanguage = languages.filter(
    (entry) => languageOf(normalizeStoryblokLanguageCode(entry.code)) === language,
  );
  // A language-only code (`de`) covers every regional project locale of that
  // language. Otherwise map only when there is a single regional candidate,
  // so `[en-us, en-gb]` never guesses for project `en`.
  const languageOnly = sameLanguage.find(
    (entry) => !normalizeStoryblokLanguageCode(entry.code).includes("-"),
  );
  if (languageOnly) {
    return languageOnly;
  }
  return sameLanguage.length === 1 ? (sameLanguage[0] ?? null) : null;
}

export type StoryblokLocaleMappingTarget = {
  projectLocale: string;
  storyblokLanguage: StoryblokLanguage;
  skippedReason?: null;
};

export type StoryblokLocaleMappingSkipped = {
  projectLocale: string;
  storyblokLanguage: null;
  skippedReason: "target_locale_unmapped";
};

/**
 * Maps project target locales to the space's translation languages. The
 * space's default language is the source and is never a target.
 */
export function mapProjectLocalesToStoryblok(input: {
  projectTargetLocales: readonly string[];
  languages: readonly StoryblokLanguage[];
  configuredTargetLocales?: readonly string[] | null;
}): {
  targets: Array<StoryblokLocaleMappingTarget | StoryblokLocaleMappingSkipped>;
  unmappedProjectTargets: string[];
} {
  const targetProjectLocales =
    input.configuredTargetLocales && input.configuredTargetLocales.length > 0
      ? input.configuredTargetLocales
      : input.projectTargetLocales;

  const targets: Array<StoryblokLocaleMappingTarget | StoryblokLocaleMappingSkipped> = [];
  const unmappedProjectTargets: string[] = [];
  for (const projectLocale of targetProjectLocales) {
    const trimmed = projectLocale.trim();
    if (!trimmed) {
      continue;
    }
    const match = resolveStoryblokLanguage(trimmed, input.languages);
    if (!match) {
      unmappedProjectTargets.push(trimmed);
      targets.push({
        projectLocale: trimmed,
        storyblokLanguage: null,
        skippedReason: "target_locale_unmapped",
      });
      continue;
    }
    targets.push({ projectLocale: trimmed, storyblokLanguage: match });
  }
  return { targets, unmappedProjectTargets };
}

export function mappedStoryblokTargets(
  targets: ReadonlyArray<StoryblokLocaleMappingTarget | StoryblokLocaleMappingSkipped>,
): StoryblokLocaleMappingTarget[] {
  return targets.filter(
    (entry): entry is StoryblokLocaleMappingTarget => entry.storyblokLanguage !== null,
  );
}
