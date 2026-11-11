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

import { sql } from "drizzle-orm";

import { db, type schema } from "@/lib/database/client";
import { getLatestRepositorySourceFileVersion } from "@/lib/file-storage/records";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { readOfficeSourceTexts } from "@/lib/projects/files/office-source-entries";
import {
  loadProjectOfficeTranslationDownload,
  officeTranslationDownloadFilename,
} from "@/lib/projects/files/office-translation-download";
import { getRepositorySourceFileImportSettings } from "@/lib/projects/files/source-file-import-settings";
import { uploadSourceFile } from "@/lib/projects/files/source-file-upload-service";
import { translationSourceFingerprintSql } from "@/lib/projects/files/translation-as-source-fingerprint";
import {
  supportsTranslationAsSource,
  TRANSLATION_AS_SOURCE_UPLOAD_SURFACE,
} from "@/lib/projects/files/translation-as-source-support";
import {
  getProjectTranslationsByKeyIds,
  getRepositorySourceFileByPath,
  listProjectTranslationKeysForFile,
} from "@/lib/projects/translations/project-translation-service";
import { shouldPrefillTranslation } from "@/lib/projects/translations/translation-prefill";
import { inferSupportedOfficeTranslationFileFormat } from "@/lib/translation/file-formats";
import { ooxmlHasLetter } from "@/lib/translation/ooxml/ooxml-paragraph";

type ProjectRecord = typeof schema.projects.$inferSelect;

/** How many unapproved strings are listed in a refusal. */
export const TRANSLATION_AS_SOURCE_MISSING_SAMPLE = 20;

const MISSING_SOURCE_TEXT_MAX_LENGTH = 200;

/** A string that still needs an approved translation, as its source text reads in the editor. */
export type TranslationAsSourceMissingString = { key: string; sourceText: string };

const KEYS_PAGE_SIZE = 500;
const KEY_ORDER = new Intl.Collator("en", { numeric: true });

export type TranslationAsSourceError =
  | { code: "unsupported_file_format" }
  | { code: "same_project" }
  | { code: "project_not_native" }
  | { code: "locale_not_a_target" }
  | { code: "destination_source_locale_mismatch" }
  | { code: "source_file_not_found" }
  | { code: "source_file_not_ready" }
  | { code: "source_file_read_failed" }
  | { code: "no_strings" }
  | {
      code: "translations_not_approved";
      missingCount: number;
      totalCount: number;
      missingStrings: TranslationAsSourceMissingString[];
    }
  | { code: "file_build_failed" }
  | { code: "file_cannot_be_written" }
  | { code: "file_reads_differently" }
  | { code: "upload_failed" };

export type TranslationAsSourceResult = {
  destinationProjectId: string;
  sourcePath: string;
  sourceFileVersionId: string;
  stringCount: number;
};

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

/** A string of the file as it is sent: its source text and the approved translation written over it. */
type SentString = { sourceText: string; translation: string | null; isHidden: boolean };

/**
 * Every key of the file with its `locale` translation, and the visible ones without an
 * approved translation.
 */
async function loadFileStrings(input: {
  organizationId: string;
  projectId: string;
  repositorySourceFileId: string;
  locale: string;
}): Promise<{
  totalCount: number;
  missingCount: number;
  missingStrings: TranslationAsSourceMissingString[];
  strings: Map<string, SentString>;
}> {
  let totalCount = 0;
  let missingCount = 0;
  const missingStrings: TranslationAsSourceMissingString[] = [];
  const strings = new Map<string, SentString>();

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
      const translation = translationByKeyId.get(key.id);
      const approved =
        translation?.status === "approved" &&
        shouldPrefillTranslation({ targetText: translation.text, status: translation.status });
      strings.set(key.key, {
        sourceText: key.sourceText,
        translation: approved ? translation.text : null,
        isHidden: key.isHidden,
      });
      if (key.isHidden) {
        continue;
      }
      totalCount += 1;
      if (approved) {
        continue;
      }
      missingCount += 1;
      missingStrings.push(missingString(key.key, { ...key, translation: null }));
    }

    if (keys.length < KEYS_PAGE_SIZE) {
      break;
    }
  }

  // Keys sort as text ("#10" before "#2"); numbers in them are ordered as numbers instead.
  missingStrings.sort((left, right) => KEY_ORDER.compare(left.key, right.key));
  return {
    totalCount,
    missingCount,
    missingStrings: missingStrings.slice(0, TRANSLATION_AS_SOURCE_MISSING_SAMPLE),
    strings,
  };
}

function missingString(key: string, sent: SentString): TranslationAsSourceMissingString {
  return { key, sourceText: sent.sourceText.slice(0, MISSING_SOURCE_TEXT_MAX_LENGTH) };
}

function sameText(left: string, right: string): boolean {
  return left.replace(/\s+/g, " ").trim() === right.replace(/\s+/g, " ").trim();
}

/**
 * What stops the built file, read as the destination will read it, from being sent: a string
 * still in the file without an approved translation (one hidden by hand), or a reading that is
 * not the original's strings with their translations. A sheet whose first row names the
 * destination's source language after translation is read by rows there, not by cells.
 */
function readBackProblem(
  readBack: Readonly<Record<string, string>>,
  strings: ReadonlyMap<string, SentString>,
): Extract<
  TranslationAsSourceError,
  { code: "translations_not_approved" | "file_reads_differently" }
> | null {
  const differs = { code: "file_reads_differently" } as const;
  const keys = Object.keys(readBack);
  if (keys.length === 0) {
    return differs;
  }
  const unapproved: TranslationAsSourceMissingString[] = [];
  for (const key of keys) {
    const sent = strings.get(key);
    if (!sent) {
      return differs;
    }
    if (sent.translation === null) {
      unapproved.push(missingString(key, sent));
    } else if (
      sameText(readBack[key] ?? "", sent.sourceText) &&
      !sameText(sent.translation, sent.sourceText)
    ) {
      // The original text where a translation was to be written.
      return differs;
    }
  }
  if (unapproved.length > 0) {
    return {
      code: "translations_not_approved",
      missingCount: unapproved.length,
      totalCount: keys.length,
      missingStrings: unapproved.slice(0, TRANSLATION_AS_SOURCE_MISSING_SAMPLE),
    };
  }
  // Every visible string arrives, unless its translation has no letters and so is no string.
  for (const [key, sent] of strings) {
    if (
      !sent.isHidden &&
      sent.translation !== null &&
      ooxmlHasLetter(sent.translation) &&
      !Object.hasOwn(readBack, key)
    ) {
      return differs;
    }
  }
  return null;
}

/**
 * Builds `sourcePath` in `locale` from approved translations and uploads it to
 * `destinationProject` as a source file under the same path (`.xlsx` for an `.xls` file), so
 * both projects key the file's strings alike and a later send updates the same strings. Each
 * send gives the destination file the original's import settings, which the file was built
 * through.
 *
 * Refused while any string in the file lacks an approved translation: the writers keep the
 * original text where a translation is missing, which the destination would read as source.
 * Refused too when the destination would not read the built file as the original's strings.
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
  if (version.ingestState === "failed") {
    return err({ code: "source_file_read_failed" });
  }
  // Keys belong to the last ingested version; a newer one still being read may not match them.
  if (version.ingestState !== "ingested") {
    return err({ code: "source_file_not_ready" });
  }

  // Read before the translations: a change made after it, even one the file then carries,
  // makes the file read as changed since sent, never the reverse.
  const fingerprinted = await db.execute<{ fingerprint: string }>(
    sql`select ${translationSourceFingerprintSql({
      organizationId: input.organizationId,
      projectId: sourceProject.id,
      repositorySourceFileId: sourceFile.id,
      locale: input.locale,
    })} as fingerprint`,
  );
  const fingerprint = fingerprinted.rows[0].fingerprint;

  const { strings, ...unapproved } = await loadFileStrings({
    organizationId: input.organizationId,
    projectId: sourceProject.id,
    repositorySourceFileId: sourceFile.id,
    locale: input.locale,
  });
  if (strings.size === 0) {
    return err({ code: "no_strings" });
  }
  if (unapproved.missingCount > 0) {
    return err({ code: "translations_not_approved", ...unapproved });
  }

  const built = await loadProjectOfficeTranslationDownload({
    ...scope,
    targetLocale: input.locale,
    approvedTranslationsOnly: true,
  });
  // The writer refused this file: the same file and translations are refused again.
  if (
    isErr(built) &&
    built.error.code !== "project_not_found" &&
    built.error.code !== "source_content_not_found"
  ) {
    return err({ code: "file_cannot_be_written" });
  }
  if (isErr(built) || !built.value) {
    return err({ code: "file_build_failed" });
  }

  // The builder takes the newest version as its template, which must still be the one checked.
  const builtFrom = await getLatestRepositorySourceFileVersion(scope);
  if (builtFrom?.id !== version.id) {
    return err({ code: "source_file_not_ready" });
  }

  // Only an .xls file changes its name; any other keeps its path as it is written.
  const destinationPath =
    inferSupportedOfficeTranslationFileFormat(version.sourcePath) === "xls"
      ? officeTranslationDownloadFilename(version.sourcePath, built.value)
      : version.sourcePath;
  const importSettings = (await getRepositorySourceFileImportSettings(scope))?.importSettings;
  const readBack = await readOfficeSourceTexts({
    sourcePath: destinationPath,
    content: built.value.content,
    sourceLocale: input.locale,
    importSettings,
  });
  if (isErr(readBack)) {
    return err({ code: "file_reads_differently" });
  }
  const problem = readBackProblem(readBack.value, strings);
  if (problem) {
    return err(problem);
  }

  const uploaded = await uploadSourceFile({
    organizationId: input.organizationId,
    project: destinationProject,
    file: {
      filename: path.posix.basename(destinationPath),
      contentType: built.value.contentType,
      content: built.value.content,
    },
    sourcePath: destinationPath,
    importSettings,
    uploadSurface: TRANSLATION_AS_SOURCE_UPLOAD_SURFACE,
    uploadedByUserId: input.actorUserId,
    actorUserId: input.actorUserId,
    translationSource: {
      projectId: sourceProject.id,
      locale: input.locale,
      sourceFileVersionId: version.id,
      fingerprint,
    },
    deferAfterResponse: input.deferAfterResponse,
    fileStorageAdapter: input.fileStorageAdapter,
  });
  if (isErr(uploaded) || uploaded.value.destination !== "native") {
    return err({ code: "upload_failed" });
  }

  return ok({
    destinationProjectId: destinationProject.id,
    sourcePath: destinationPath,
    sourceFileVersionId: uploaded.value.file.sourceFileVersionId,
    stringCount: Object.keys(readBack.value).length,
  });
}
