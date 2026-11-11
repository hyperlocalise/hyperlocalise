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
  isBinaryTranslationFileFormat,
  isPdfTranslationFileFormat,
} from "@/lib/translation/file-formats";

export const maxInlineTextBytes = 512 * 1024;

export function canInlineProjectFileText(filename: string, byteSize: number): boolean {
  if (byteSize > maxInlineTextBytes) {
    return false;
  }

  const format = inferSupportedFileTranslationFileFormat(filename);
  return Boolean(
    format && !isBinaryTranslationFileFormat(format) && !isPdfTranslationFileFormat(format),
  );
}
