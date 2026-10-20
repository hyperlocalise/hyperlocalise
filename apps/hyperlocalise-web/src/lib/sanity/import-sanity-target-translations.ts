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

import { createLogger } from "@/lib/log";
import { importApprovedProjectTranslationsFromEntries } from "@/lib/projects/translations/project-translation-service";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import { hashSanityTranslationMap, type SanityTranslationMap } from "./document-json";
import {
  decideSanityExistingTranslationAction,
  type SanityExistingTranslationPolicy,
} from "./existing-translation-policy";
import { normalizeSanityLocaleTag } from "./sanity-locale";

const logger = createLogger("import-sanity-target-translations");

export type ImportSanityTargetTranslationsResult = {
  importedLocales: string[];
  skippedLocales: string[];
  failedLocales: string[];
  importedTranslationHashes: Record<string, string>;
  pushReadyLocales: string[];
};

async function loadSanityLocaleTranslationPresence(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  storedImportedHashes: Record<string, string>;
}) {
  const translationService = new ProjectTranslationService();
  const prefilled = await translationService.loadAsPrefilledEntries({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
    approvedTranslationsOnly: false,
    readyTranslationsOnly: false,
  });
  const approved = await translationService.loadAsPrefilledEntries({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
    approvedTranslationsOnly: true,
    readyTranslationsOnly: true,
  });
  const importedHash = input.storedImportedHashes[input.targetLocale];
  const hasExistingTranslation = prefilled.translatedKeyCount > 0;
  return {
    pushReady: approved.translatedKeyCount > 0,
    hasExistingTranslation,
    importProvenanceOnly: Boolean(importedHash),
    contentHash: importedHash ?? null,
  };
}

export async function importSanityTargetTranslations(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  localeMapping: {
    jobTargetLocales: readonly string[];
    intercomTargetLocales: readonly string[];
  };
  targetMapsBySanityLocale: Record<string, SanityTranslationMap>;
  policy: SanityExistingTranslationPolicy;
  storedImportedHashes?: Record<string, string> | null;
}): Promise<ImportSanityTargetTranslationsResult> {
  const importedTranslationHashes: Record<string, string> = {
    ...input.storedImportedHashes,
  };
  const importedLocales: string[] = [];
  const skippedLocales: string[] = [];
  const failedLocales: string[] = [];
  const pushReadyLocales: string[] = [];

  for (let index = 0; index < input.localeMapping.jobTargetLocales.length; index += 1) {
    const projectLocale = input.localeMapping.jobTargetLocales[index]!;
    const sanityLocale = input.localeMapping.intercomTargetLocales[index];
    if (!sanityLocale) {
      continue;
    }
    const remoteMap = input.targetMapsBySanityLocale[sanityLocale] ?? {};
    if (Object.keys(remoteMap).length === 0) {
      skippedLocales.push(projectLocale);
      continue;
    }

    const incomingHash = hashSanityTranslationMap(remoteMap);
    const presence = await loadSanityLocaleTranslationPresence({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: projectLocale,
      storedImportedHashes: importedTranslationHashes,
    });

    const action = decideSanityExistingTranslationAction({
      policy: input.policy,
      presence,
      incomingHash,
    });
    if (action === "skip") {
      skippedLocales.push(projectLocale);
      if (presence.pushReady) {
        pushReadyLocales.push(projectLocale);
      }
      continue;
    }

    try {
      const result = await importApprovedProjectTranslationsFromEntries({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        targetLocale: projectLocale,
        entries: remoteMap,
      });
      if (result.imported > 0) {
        importedLocales.push(projectLocale);
        importedTranslationHashes[projectLocale] = incomingHash;
      } else {
        skippedLocales.push(projectLocale);
      }
    } catch (error) {
      logger.warn({ projectLocale, sourcePath: input.sourcePath, error }, "sanity_seed_failed");
      failedLocales.push(projectLocale);
    }
  }

  for (const locale of input.localeMapping.jobTargetLocales) {
    const key = normalizeSanityLocaleTag(locale).toLowerCase();
    if (
      importedLocales.some((entry) => normalizeSanityLocaleTag(entry).toLowerCase() === key) ||
      pushReadyLocales.some((entry) => normalizeSanityLocaleTag(entry).toLowerCase() === key)
    ) {
      continue;
    }
    const presence = await loadSanityLocaleTranslationPresence({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: locale,
      storedImportedHashes: importedTranslationHashes,
    });
    if (presence.pushReady) {
      pushReadyLocales.push(locale);
    }
  }

  return {
    importedLocales,
    skippedLocales,
    failedLocales,
    importedTranslationHashes,
    pushReadyLocales,
  };
}
