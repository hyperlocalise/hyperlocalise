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
import { and, inArray, isNotNull } from "drizzle-orm";

import type { GlossaryRecord } from "@/api/routes/glossary/glossary.schema";
import { db, schema } from "@/lib/database";
import { getLocaleLabel } from "@/lib/i18n/locales";
import type { Glossary } from "@/lib/database/types";

export async function queryNativeGlossaryLanguages(glossaries: Glossary[]) {
  const nativeGlossaries = glossaries.filter((glossary) => glossary.source === "native");
  const languagesByGlossaryId = new Map<string, GlossaryRecord["languages"]>();

  if (nativeGlossaries.length === 0) {
    return languagesByGlossaryId;
  }

  const rows = await db
    .select({ glossaryId: schema.glossaryTerms.glossaryId, locale: schema.glossaryTerms.locale })
    .from(schema.glossaryTerms)
    .where(
      and(
        inArray(
          schema.glossaryTerms.glossaryId,
          nativeGlossaries.map((glossary) => glossary.id),
        ),
        isNotNull(schema.glossaryTerms.locale),
      ),
    );
  const localesByGlossaryId = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!row.locale) continue;
    const locales = localesByGlossaryId.get(row.glossaryId) ?? new Set<string>();
    locales.add(row.locale);
    localesByGlossaryId.set(row.glossaryId, locales);
  }

  for (const glossary of nativeGlossaries) {
    const locales = new Set([
      glossary.sourceLocale,
      ...(localesByGlossaryId.get(glossary.id) ?? []),
    ]);
    languagesByGlossaryId.set(
      glossary.id,
      [...locales].map((locale) => ({
        locale,
        name: getLocaleLabel(locale),
        isSource: locale === glossary.sourceLocale,
      })),
    );
  }

  return languagesByGlossaryId;
}

export async function queryNativeGlossaryLanguagesForGlossary(glossary: Glossary) {
  const languages = await queryNativeGlossaryLanguages([glossary]);
  return languages.get(glossary.id) ?? [];
}
