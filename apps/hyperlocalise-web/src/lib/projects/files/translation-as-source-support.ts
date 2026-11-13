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
import { inferSupportedOfficeTranslationFileFormat } from "@/lib/translation/file-formats";

/**
 * The upload surface of source file versions built from another project's translations. Ingest
 * keeps the keys such a version no longer has (hidden, not deleted), as it does for a sync.
 */
export const TRANSLATION_AS_SOURCE_UPLOAD_SURFACE = "translation_as_source";

/** Word and Excel files only so far; see the chained stages design record. */
export function supportsTranslationAsSource(sourcePath: string): boolean {
  const format = inferSupportedOfficeTranslationFileFormat(sourcePath);
  return format === "docx" || format === "xlsx" || format === "xls";
}
