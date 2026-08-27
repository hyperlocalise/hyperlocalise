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
import type { GlossaryRecord } from "@/api/routes/glossary/glossary.schema";
import type { Glossary } from "@/lib/database/types";
import { getLocaleLabel } from "@/lib/i18n/locales";
import { sanitizeExternalUrl } from "@/lib/security/safe-external-url";

export function toGlossaryRecord(
  glossary: Glossary,
  languages: GlossaryRecord["languages"] = defaultGlossaryLanguages(glossary),
  termCount: number | null = glossary.termCount,
  projectCount = 0,
): GlossaryRecord {
  const resolvedLanguages = languages.length > 0 ? languages : defaultGlossaryLanguages(glossary);

  return {
    id: glossary.id,
    organizationId: glossary.organizationId,
    createdByUserId: glossary.createdByUserId,
    name: glossary.name,
    description: glossary.description,
    sourceLocale: glossary.sourceLocale,
    targetLocale: glossary.targetLocale,
    languages: resolvedLanguages,
    status: glossary.status,
    source: glossary.source,
    controlLevel: glossary.controlLevel,
    externalProviderKind: glossary.externalProviderKind,
    externalProjectId: glossary.externalProjectId,
    externalResourceType: glossary.externalResourceType,
    externalGlossaryId: glossary.externalGlossaryId,
    localeCoverage: glossary.localeCoverage,
    termCount,
    projectCount,
    syncState: glossary.syncState,
    termCapabilities: glossary.termCapabilities,
    externalUrl: sanitizeExternalUrl(glossary.externalUrl),
    lastSyncedAt: glossary.lastSyncedAt?.toISOString() ?? null,
    lastSyncErrorAt: glossary.lastSyncErrorAt?.toISOString() ?? null,
    lastSyncErrorMessage: glossary.lastSyncErrorMessage,
    createdAt: glossary.createdAt.toISOString(),
    updatedAt: glossary.updatedAt.toISOString(),
  };
}

function defaultGlossaryLanguages(glossary: Glossary): GlossaryRecord["languages"] {
  const locales =
    glossary.source === "native"
      ? [glossary.sourceLocale, ...glossary.localeCoverage]
      : glossary.localeCoverage.length > 0
        ? glossary.localeCoverage
        : [glossary.sourceLocale, glossary.targetLocale].filter((locale): locale is string =>
            Boolean(locale),
          );
  const seen = new Set<string>();

  return locales.flatMap((locale) => {
    if (seen.has(locale)) {
      return [];
    }
    seen.add(locale);
    return [{ locale, name: getLocaleLabel(locale), isSource: locale === glossary.sourceLocale }];
  });
}
