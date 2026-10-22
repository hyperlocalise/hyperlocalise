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

import {
  inferSupportedSourceUploadFormat,
  type SupportedTranslationFileFormat,
} from "@/lib/translation/file-formats";

import { GOOGLE_EXPORT_MIME, GOOGLE_MIME } from "./constants";
import { GOOGLE_DRIVE_MAX_FILE_BYTES, GOOGLE_DRIVE_MAX_FOLDER_DEPTH } from "./limits";
import {
  isAnyTranslationOutputFile,
  isNamedTranslationOutputFile,
  isTranslationOutputFile,
  type GoogleDriveTranslationOutput,
} from "./translation-filename";

export type GoogleDriveSkipReason =
  | "unsupported_google_app"
  | "unsupported_shortcut"
  | "unsupported_archive"
  | "file_too_large"
  | "folder_depth_exceeded"
  | "unsupported_extension"
  | "translation_output";

export type GoogleDriveIngestKind = "google_doc" | "google_sheet" | "google_slide" | "binary";

export type GoogleDriveFileClassification =
  | {
      kind: "folder";
    }
  | {
      kind: "supported";
      ingestKind: GoogleDriveIngestKind;
      ingestFormat: SupportedTranslationFileFormat;
      ingestExtension: string;
      exportMimeType?: string;
      uploadMimeType?: string;
    }
  | {
      kind: "skipped";
      reason: GoogleDriveSkipReason;
    };

const ARCHIVE_EXTENSIONS = new Set([".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".tgz"]);

const UNSUPPORTED_GOOGLE_MIMES = new Set<string>([
  GOOGLE_MIME.script,
  GOOGLE_MIME.drawing,
  GOOGLE_MIME.form,
  GOOGLE_MIME.site,
]);

function isArchiveName(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return ARCHIVE_EXTENSIONS.has(ext);
}

export function hideGoogleDriveTranslationOutputsOnIngest(input: {
  explicitlySelected: boolean;
  includeTranslatedFiles: boolean;
}): boolean {
  if (input.explicitlySelected) {
    return false;
  }
  return !input.includeTranslatedFiles;
}

export function classifyGoogleDriveItem(input: {
  name: string;
  mimeType: string;
  sizeBytes?: number | null;
  folderDepth?: number;
  hideTranslationOutputs?: boolean;
  relativePath?: string;
  translationOutput?: GoogleDriveTranslationOutput;
  targetLocales?: readonly string[];
}): GoogleDriveFileClassification {
  const mimeType = input.mimeType.trim();
  const name = input.name.trim();

  if (mimeType === GOOGLE_MIME.folder) {
    return { kind: "folder" };
  }

  if (
    input.hideTranslationOutputs !== false &&
    (input.translationOutput
      ? isTranslationOutputFile({
          output: input.translationOutput,
          name,
          relativePath: input.relativePath,
          targetLocales: input.targetLocales,
        })
      : isNamedTranslationOutputFile(name) ||
        isAnyTranslationOutputFile({
          name,
          relativePath: input.relativePath,
        }))
  ) {
    return { kind: "skipped", reason: "translation_output" };
  }

  if (typeof input.folderDepth === "number" && input.folderDepth > GOOGLE_DRIVE_MAX_FOLDER_DEPTH) {
    return { kind: "skipped", reason: "folder_depth_exceeded" };
  }

  const sizeBytes = input.sizeBytes ?? null;
  if (typeof sizeBytes === "number" && sizeBytes > GOOGLE_DRIVE_MAX_FILE_BYTES) {
    return { kind: "skipped", reason: "file_too_large" };
  }

  if (UNSUPPORTED_GOOGLE_MIMES.has(mimeType)) {
    return { kind: "skipped", reason: "unsupported_google_app" };
  }

  if (mimeType === GOOGLE_MIME.shortcut) {
    return { kind: "skipped", reason: "unsupported_shortcut" };
  }

  if (isArchiveName(name) || mimeType === "application/zip") {
    return { kind: "skipped", reason: "unsupported_archive" };
  }

  const mimeBase = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mimeBase === "text/plain" && path.extname(name).toLowerCase() !== ".txt") {
    return {
      kind: "supported",
      ingestKind: "binary",
      ingestFormat: "txt",
      ingestExtension: ".txt",
    };
  }

  if (mimeType === GOOGLE_MIME.document) {
    return {
      kind: "supported",
      ingestKind: "google_doc",
      ingestFormat: "docx",
      ingestExtension: ".docx",
      exportMimeType: GOOGLE_EXPORT_MIME.docx,
      uploadMimeType: GOOGLE_MIME.document,
    };
  }

  if (mimeType === GOOGLE_MIME.spreadsheet) {
    return {
      kind: "supported",
      ingestKind: "google_sheet",
      ingestFormat: "xlsx",
      ingestExtension: ".xlsx",
      exportMimeType: GOOGLE_EXPORT_MIME.xlsx,
      uploadMimeType: GOOGLE_MIME.spreadsheet,
    };
  }

  if (mimeType === GOOGLE_MIME.presentation) {
    return {
      kind: "supported",
      ingestKind: "google_slide",
      ingestFormat: "pptx",
      ingestExtension: ".pptx",
      exportMimeType: GOOGLE_EXPORT_MIME.pptx,
      uploadMimeType: GOOGLE_MIME.presentation,
    };
  }

  const format = inferSupportedSourceUploadFormat(name);
  if (!format) {
    return { kind: "skipped", reason: "unsupported_extension" };
  }

  return {
    kind: "supported",
    ingestKind: "binary",
    ingestFormat: format,
    ingestExtension: path.extname(name).toLowerCase() || "",
  };
}
