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

import type { WebflowLocale } from "./types";

export function normalizeWebflowLocaleTag(tag: string): string {
  return canonicalizeLocale(tag.trim()) ?? tag.trim();
}

export function areWebflowSourceLocalesCompatible(
  configuredSource: string,
  projectSource: string,
): boolean {
  return normalizeWebflowLocaleTag(configuredSource) === normalizeWebflowLocaleTag(projectSource);
}

export function resolveWebflowLocaleKey(
  projectLocale: string,
  catalog: readonly WebflowLocale[],
): WebflowLocale | null {
  const normalized = normalizeWebflowLocaleTag(projectLocale);
  for (const entry of catalog) {
    if (normalizeWebflowLocaleTag(entry.tag) === normalized) {
      return entry;
    }
  }
  const language = normalized.split("-")[0]?.toLowerCase();
  if (!language) {
    return null;
  }
  for (const entry of catalog) {
    const entryLanguage = normalizeWebflowLocaleTag(entry.tag).split("-")[0]?.toLowerCase();
    if (entryLanguage === language) {
      return entry;
    }
  }
  return null;
}

export type WebflowLocaleMappingTarget = {
  projectLocale: string;
  webflowLocale: WebflowLocale;
  skippedReason?: null;
};

export type WebflowLocaleMappingSkipped = {
  projectLocale: string;
  webflowLocale: null;
  skippedReason: "target_locale_unmapped" | "target_locale_disabled";
};

export function mapProjectLocalesToWebflow(input: {
  projectSourceLocale: string;
  projectTargetLocales: readonly string[];
  webflowLocales: WebflowSiteLocalesShape;
  configuredSourceLocale?: string | null;
  configuredTargetLocales?: readonly string[] | null;
}): {
  sourceWebflowLocale: WebflowLocale | null;
  sourceCmsLocaleId: string | null;
  targets: Array<WebflowLocaleMappingTarget | WebflowLocaleMappingSkipped>;
  unmappedProjectTargets: string[];
} {
  const catalog = [
    input.webflowLocales.primary,
    ...input.webflowLocales.secondary,
  ] as WebflowLocale[];

  const sourceTag =
    input.configuredSourceLocale?.trim() || input.projectSourceLocale.trim() || "en";
  const sourceWebflowLocale = resolveWebflowLocaleKey(sourceTag, catalog);

  const targetProjectLocales =
    input.configuredTargetLocales && input.configuredTargetLocales.length > 0
      ? input.configuredTargetLocales
      : input.projectTargetLocales;

  const targets: Array<WebflowLocaleMappingTarget | WebflowLocaleMappingSkipped> = [];
  const unmappedProjectTargets: string[] = [];

  for (const projectLocale of targetProjectLocales) {
    const trimmed = projectLocale.trim();
    if (!trimmed) {
      continue;
    }
    const match = resolveWebflowLocaleKey(trimmed, input.webflowLocales.secondary);
    if (!match) {
      unmappedProjectTargets.push(trimmed);
      targets.push({
        projectLocale: trimmed,
        webflowLocale: null,
        skippedReason: "target_locale_unmapped",
      });
      continue;
    }
    if (!match.enabled) {
      targets.push({
        projectLocale: trimmed,
        webflowLocale: null,
        skippedReason: "target_locale_disabled",
      });
      continue;
    }
    targets.push({
      projectLocale: trimmed,
      webflowLocale: match,
    });
  }

  return {
    sourceWebflowLocale,
    sourceCmsLocaleId: sourceWebflowLocale?.cmsLocaleId ?? null,
    targets,
    unmappedProjectTargets,
  };
}

export type WebflowSiteLocalesShape = {
  primary: WebflowLocale;
  secondary: WebflowLocale[];
};
