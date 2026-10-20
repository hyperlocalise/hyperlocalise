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
import type { ApiAuthContext } from "@/api/auth/workos";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import { applySanityTranslationsToDocument } from "./apply-translations";
import { readSanityTranslationMap, type SanityTranslationMap } from "./document-json";
import { sourceKeysMissingApprovedTranslations } from "./push-sanity-translations";
import { isSanityStampSegmentKey } from "./segment-file";
import type { SanityDocumentRecord } from "./sanity-field-value";

function fieldPathsFromStampKeys(translations: SanityTranslationMap): SanityTranslationMap {
  const mapped: SanityTranslationMap = {};
  for (const [key, value] of Object.entries(translations)) {
    if (isSanityStampSegmentKey(key)) {
      mapped[key.slice("sanity.k.".length)] = value;
      continue;
    }
    mapped[key] = value;
  }
  return mapped;
}

export type SanityPluginApplyPlan = {
  i18nMode: "document" | "field";
  targetSanityLocale: string;
  document: SanityDocumentRecord;
  missingKeys: string[];
};

export async function buildSanityPluginApplyPlan(input: {
  auth: ApiAuthContext;
  projectId: string;
  sourcePath: string;
  document: SanityDocumentRecord;
  i18nMode: "document" | "field";
  sourceSanityLocale: string;
  targetSanityLocale: string;
}): Promise<SanityPluginApplyPlan> {
  const translationService = new ProjectTranslationService();
  const organizationId = input.auth.organization.localOrganizationId;
  const sourceFile = await translationService.getRepositorySourceFileByPath({
    organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });
  if (!sourceFile) {
    throw new Error("sanity_document_not_collected");
  }

  const keyRows = await translationService.listKeysForFile({
    organizationId,
    projectId: input.projectId,
    repositorySourceFileId: sourceFile.id,
    limit: 5_000,
  });
  const sourceKeys = keyRows.map((row) => row.key);

  const approved = await translationService.loadAsPrefilledEntries({
    organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.targetSanityLocale,
    approvedTranslationsOnly: true,
    readyTranslationsOnly: true,
  });
  const stampTranslations = readSanityTranslationMap(approved.prefilled);
  const missingCount = sourceKeysMissingApprovedTranslations(sourceKeys, stampTranslations);
  const missingKeys =
    missingCount > 0 ? sourceKeys.filter((key) => !stampTranslations[key]?.trim()) : [];
  const translations = fieldPathsFromStampKeys(stampTranslations);

  const document = applySanityTranslationsToDocument({
    document: input.document,
    i18nMode: input.i18nMode,
    targetSanityLocale: input.targetSanityLocale,
    sourceSanityLocale: input.sourceSanityLocale,
    translations,
  });

  return {
    i18nMode: input.i18nMode,
    targetSanityLocale: input.targetSanityLocale,
    document,
    missingKeys,
  };
}
