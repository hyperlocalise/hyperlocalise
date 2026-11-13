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

/** Guideline retrieval is capped; glossary matching uses the full source. */
export const FILE_GUIDELINE_SOURCE_MAX_CHARS = 500_000;

export function resolveFileTranslationSourceTexts(source: string) {
  return {
    glossarySourceText: source,
    guidelineSourceText: source.slice(0, FILE_GUIDELINE_SOURCE_MAX_CHARS),
  };
}
