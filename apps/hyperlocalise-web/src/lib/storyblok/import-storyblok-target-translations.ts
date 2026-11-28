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
import { and, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";
import { importApprovedProjectTranslationsFromEntries } from "@/lib/projects/translations/project-translation-service";

import { hashStoryblokTranslationMap, type StoryblokTranslationMap } from "./document-json";
import {
  decideStoryblokExistingTranslationAction,
  type StoryblokExistingTranslationPolicy,
  type StoryblokLocaleTranslationPresence,
} from "./storyblok-existing-translation-policy";

const logger = createLogger("import-storyblok-target-translations");

export type ImportStoryblokTargetTranslationStatus = "imported" | "skipped" | "failed" | "absent";

/**
 * Seeds one mapped target locale with the content already present in
 * Storyblok, honoring the automation's existing-translation policy. Imported
 * translations land approved (provenance `import`) so refresh_imported can
 * tell automation-seeded work apart from human translations later.
 */
export async function importStoryblokTargetTranslation(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  incomingEntries: StoryblokTranslationMap;
  policy: StoryblokExistingTranslationPolicy;
}): Promise<{ status: ImportStoryblokTargetTranslationStatus }> {
  if (Object.keys(input.incomingEntries).length === 0) {
    return { status: "skipped" };
  }

  const presence = await loadStoryblokTargetTranslationPresence({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
  });

  const action = decideStoryblokExistingTranslationAction({
    policy: input.policy,
    presence,
    incomingHash: hashStoryblokTranslationMap(input.incomingEntries),
  });
  if (action === "skip") {
    return { status: "skipped" };
  }

  try {
    await importApprovedProjectTranslationsFromEntries({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
      entries: input.incomingEntries,
    });
  } catch (error) {
    logger.warn(
      {
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        targetLocale: input.targetLocale,
        error: error instanceof Error ? error.message : String(error),
      },
      "storyblok_target_translation_import_failed",
    );
    return { status: "failed" };
  }

  return { status: "imported" };
}

async function loadStoryblokTargetTranslationPresence(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
}): Promise<StoryblokLocaleTranslationPresence> {
  const empty: StoryblokLocaleTranslationPresence = {
    pushReady: false,
    hasExistingTranslation: false,
    importProvenanceOnly: false,
    contentHash: null,
  };

  const [sourceFile] = await db
    .select({ id: schema.repositorySourceFiles.id })
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.organizationId, input.organizationId),
        eq(schema.repositorySourceFiles.projectId, input.projectId),
        eq(schema.repositorySourceFiles.sourcePath, input.sourcePath),
      ),
    )
    .limit(1);
  if (!sourceFile) {
    return empty;
  }

  const keys = await db
    .select({ id: schema.projectTranslationKeys.id, key: schema.projectTranslationKeys.key })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id),
      ),
    );
  if (keys.length === 0) {
    return empty;
  }
  const keyById = new Map(keys.map((key) => [key.id, key.key]));

  const translations = await db
    .select({
      translationKeyId: schema.projectTranslations.translationKeyId,
      text: schema.projectTranslations.text,
      status: schema.projectTranslations.status,
      provenance: schema.projectTranslations.provenance,
    })
    .from(schema.projectTranslations)
    .where(
      and(
        eq(schema.projectTranslations.organizationId, input.organizationId),
        eq(schema.projectTranslations.projectId, input.projectId),
        eq(schema.projectTranslations.targetLocale, input.targetLocale),
        inArray(
          schema.projectTranslations.translationKeyId,
          keys.map((key) => key.id),
        ),
      ),
    );
  if (translations.length === 0) {
    return empty;
  }

  const approved = translations.filter((row) => row.status === "approved");
  const provenances = new Set(approved.map((row) => row.provenance));
  const approvedEntries: StoryblokTranslationMap = {};
  for (const row of approved) {
    const key = keyById.get(row.translationKeyId);
    if (key !== undefined) {
      approvedEntries[key] = row.text;
    }
  }

  return {
    pushReady: approved.length > 0,
    hasExistingTranslation: true,
    importProvenanceOnly:
      approved.length > 0 && [...provenances].every((value) => value === "import"),
    contentHash: approved.length > 0 ? hashStoryblokTranslationMap(approvedEntries) : null,
  };
}
