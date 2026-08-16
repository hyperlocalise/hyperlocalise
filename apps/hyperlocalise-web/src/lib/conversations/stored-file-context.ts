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
import {
  inferSupportedFileTranslationFileFormat,
  type SupportedFileTranslationFileFormat,
} from "@/lib/translation/file-formats";

export type StoredTranslationFileRef = {
  id: string;
  filename: string;
  contentType: string;
  fileFormat: SupportedFileTranslationFileFormat;
};

export function toStoredTranslationFileRef(file: {
  id: string;
  filename: string;
  contentType: string;
}): StoredTranslationFileRef | null {
  const fileFormat = inferSupportedFileTranslationFileFormat(file.filename);
  if (!fileFormat) {
    return null;
  }

  return {
    id: file.id,
    filename: file.filename,
    contentType: file.contentType,
    fileFormat,
  };
}

export function buildStoredFileContext(files: StoredTranslationFileRef[]) {
  if (files.length === 0) {
    return null;
  }

  return [
    "Attached translation source files are already stored and ready for file translation jobs:",
    ...files.map(
      (file) =>
        `- ${file.filename}: sourceFileId=${file.id}, fileFormat=${file.fileFormat}, contentType=${file.contentType}`,
    ),
    "Use these sourceFileId values when creating file translation jobs.",
  ].join("\n");
}

export function appendStoredFileContext(text: string, files: StoredTranslationFileRef[]) {
  const fileContext = buildStoredFileContext(files);
  if (!fileContext) {
    return text;
  }

  return [text.trim() || "Please translate the attached source file.", "", fileContext].join("\n");
}
