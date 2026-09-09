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

export const ORIGINAL_DOCUMENT_UNAVAILABLE_CONTEXT =
  "Original document unavailable. Do not claim to verify the translation against it.";

const ORIGINAL_DOCUMENT_CONTEXT_LIMIT = 15_000;

export async function loadOriginalDocumentContext(
  sourceUrl: string | null | undefined,
  sourceLocale: string,
): Promise<string> {
  if (!sourceUrl) {
    return ORIGINAL_DOCUMENT_UNAVAILABLE_CONTEXT;
  }

  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      return ORIGINAL_DOCUMENT_UNAVAILABLE_CONTEXT;
    }
    const originalText = await response.text();
    return `Original document in ${sourceLocale} (reference only, may be truncated):\n${originalText.slice(0, ORIGINAL_DOCUMENT_CONTEXT_LIMIT)}`;
  } catch {
    return ORIGINAL_DOCUMENT_UNAVAILABLE_CONTEXT;
  }
}
