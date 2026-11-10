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
import path from "node:path";

import type { schema } from "@/lib/database/client";
import { getLatestRepositorySourceFileVersion } from "@/lib/file-storage/records";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { loadProjectOfficeTranslationDownload } from "@/lib/projects/files/office-translation-download";
import { uploadSourceFile } from "@/lib/projects/files/source-file-upload-service";
import {
  getProjectTranslationsByKeyIds,
  getRepositorySourceFileByPath,
  listProjectTranslationKeysForFile,
} from "@/lib/projects/translations/project-translation-service";
import { shouldPrefillTranslation } from "@/lib/projects/translations/translation-prefill";
import { inferSupportedOfficeTranslationFileFormat } from "@/lib/translation/file-formats";

type ProjectRecord = typeof schema.projects.$inferSelect;

export const TRANSLATION_AS_SOURCE_UPLOAD_SURFACE = "translation_as_source";

/** How many unapproved strings are listed in a refusal. */
export const TRANSLATION_AS_SOURCE_MISSING_SAMPLE = 20;

const MISSING_SOURCE_TEXT_MAX_LENGTH = 200;

/** A string that still needs an approved translation, as its source text reads in the editor. */
export type TranslationAsSourceMissingString = { key: string; sourceText: string };

const KEYS_PAGE_SIZE = 500;

export type TranslationAsSourceError =
  | { code: "unsupported_file_format" }
  | { code: "same_project" }
  | { code: "project_not_native" }
  | { code: "locale_not_a_target" }
  | { code: "destination_source_locale_mismatch" }
  | { code: "source_file_not_found" }
  | { code: "source_file_not_ready" }
  | {
      code: "translations_not_approved";
      missingCount: number;
      totalCount: number;
      missingStrings: TranslationAsSourceMissingString[];
    }
  | { code: "file_build_failed" }
  | { code: "upload_failed" };

export type TranslationAsSourceResult = {
  destinationProjectId: string;
  sourcePath: string;
  sourceFileVersionId: string;
  stringCount: number;
};

/** Only Word files round-trip with the same keys so far; see the chained stages design record. */
export function supportsTranslationAsSource(sourcePath: string): boolean {
  return inferSupportedOfficeTranslationFileFormat(sourcePath) === "docx";
}

/** Whether `destination` can take `source`'s translations as its source text. */
export function isTranslationSourceDestination(
  source: Pick<ProjectRecord, "id" | "source" | "targetLocales">,
  destination: Pick<ProjectRecord, "id" | "source" | "sourceLocale">,
): boolean {
  return (
    destination.id !== source.id &&
    source.source === "native" &&
    destination.source === "native" &&
    destination.sourceLocale != null &&
    source.targetLocales.includes(destination.sourceLocale)
  );
}

/** Visible keys of the file without an approved translation in `locale`. */
async function countUnapprovedKeys(input: {
  organizationId: string;
  projectId: string;
  repositorySourceFileId: string;
  locale: string;
}): Promise<{
  totalCount: number;
  missingCount: number;
  missingStrings: TranslationAsSourceMissingString[];
}> {
  let totalCount = 0;
  let missingCount = 0;
  const missingStrings: TranslationAsSourceMissingString[] = [];

  for (let offset = 0; ; offset += KEYS_PAGE_SIZE) {
    const keys = await listProjectTranslationKeysForFile({
      organizationId: input.organizationId,
      projectId: input.projectId,
      repositorySourceFileId: input.repositorySourceFileId,
      limit: KEYS_PAGE_SIZE,
      offset,
    });
    if (keys.length === 0) {
      break;
    }

    const translations = await getProjectTranslationsByKeyIds({
      organizationId: input.organizationId,
      projectId: input.projectId,
      translationKeyIds: keys.map((key) => key.id),
      targetLocale: input.locale,
    });
    const translationByKeyId = new Map(
      translations.map((translation) => [translation.translationKeyId, translation]),
    );

    for (const key of keys) {
      if (key.isHidden) {
        continue;
      }
      totalCount += 1;
      const translation = translationByKeyId.get(key.id);
      const approved =
        translation?.status === "approved" &&
        shouldPrefillTranslation({ targetText: translation.text, status: translation.status });
      if (approved) {
        continue;
      }
      missingCount += 1;
      if (missingStrings.length < TRANSLATION_AS_SOURCE_MISSING_SAMPLE) {
        missingStrings.push({
          key: key.key,
          sourceText: key.sourceText.slice(0, MISSING_SOURCE_TEXT_MAX_LENGTH),
        });
      }
    }

    if (keys.length < KEYS_PAGE_SIZE) {
      break;
    }
  }

  return { totalCount, missingCount, missingStrings };
}

/**
 * Builds `sourcePath` in `locale` from approved translations and uploads it to
 * `destinationProject` as a source file under the same path, so both projects key the file's
 * strings alike and a later send updates the same strings.
 *
 * Refused while any visible string lacks an approved translation: the Word writer keeps the
 * original text where a translation is missing, which the destination would read as source.
 */
export async function sendTranslationAsSource(input: {
  organizationId: string;
  sourceProject: ProjectRecord;
  destinationProject: ProjectRecord;
  sourcePath: string;
  locale: string;
  actorUserId: string;
  deferAfterResponse?: (task: () => Promise<unknown>) => void;
  fileStorageAdapter?: FileStorageAdapter;
}): Promise<Result<TranslationAsSourceResult, TranslationAsSourceError>> {
  const { sourceProject, destinationProject } = input;

  if (!supportsTranslationAsSource(input.sourcePath)) {
    return err({ code: "unsupported_file_format" });
  }
  if (sourceProject.id === destinationProject.id) {
    return err({ code: "same_project" });
  }
  if (sourceProject.source !== "native" || destinationProject.source !== "native") {
    return err({ code: "project_not_native" });
  }
  if (!sourceProject.targetLocales.includes(input.locale)) {
    return err({ code: "locale_not_a_target" });
  }
  if (destinationProject.sourceLocale !== input.locale) {
    return err({ code: "destination_source_locale_mismatch" });
  }

  const scope = {
    organizationId: input.organizationId,
    projectId: sourceProject.id,
    sourcePath: input.sourcePath,
  };
  const [sourceFile, version] = await Promise.all([
    getRepositorySourceFileByPath(scope),
    getLatestRepositorySourceFileVersion(scope),
  ]);
  if (!sourceFile || !version) {
    return err({ code: "source_file_not_found" });
  }
  // Keys belong to the last ingested version; a newer one still being read may not match them.
  if (version.ingestState !== "ingested") {
    return err({ code: "source_file_not_ready" });
  }

  const unapproved = await countUnapprovedKeys({
    organizationId: input.organizationId,
    projectId: sourceProject.id,
    repositorySourceFileId: sourceFile.id,
    locale: input.locale,
  });
  if (unapproved.totalCount === 0) {
    return err({ code: "source_file_not_ready" });
  }
  if (unapproved.missingCount > 0) {
    return err({ code: "translations_not_approved", ...unapproved });
  }

  const built = await loadProjectOfficeTranslationDownload({
    ...scope,
    targetLocale: input.locale,
    approvedTranslationsOnly: true,
  });
  if (isErr(built) || !built.value) {
    return err({ code: "file_build_failed" });
  }

  const uploaded = await uploadSourceFile({
    organizationId: input.organizationId,
    project: destinationProject,
    file: {
      filename: path.posix.basename(version.sourcePath),
      contentType: built.value.contentType,
      content: built.value.content,
    },
    sourcePath: version.sourcePath,
    uploadSurface: TRANSLATION_AS_SOURCE_UPLOAD_SURFACE,
    uploadedByUserId: input.actorUserId,
    actorUserId: input.actorUserId,
    translationSource: {
      projectId: sourceProject.id,
      locale: input.locale,
      sourceFileVersionId: version.id,
    },
    deferAfterResponse: input.deferAfterResponse,
    fileStorageAdapter: input.fileStorageAdapter,
  });
  if (isErr(uploaded) || uploaded.value.destination !== "native") {
    return err({ code: "upload_failed" });
  }

  return ok({
    destinationProjectId: destinationProject.id,
    sourcePath: version.sourcePath,
    sourceFileVersionId: uploaded.value.file.sourceFileVersionId,
    stringCount: unapproved.totalCount,
  });
}
