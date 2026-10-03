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

import { formatInternalMarkupForDisplay } from "@/components/content-editor/message-format/content-editor-internal-markup";

const EMPTY_STATE_SOURCE_MAX_LENGTH = 80;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function truncateSourceLabel(text: string) {
  const graphemes: string[] = [];
  for (const { segment } of graphemeSegmenter.segment(text)) {
    graphemes.push(segment);
    if (graphemes.length > EMPTY_STATE_SOURCE_MAX_LENGTH) {
      break;
    }
  }
  if (graphemes.length <= EMPTY_STATE_SOURCE_MAX_LENGTH) {
    return text;
  }
  return `${graphemes
    .slice(0, EMPTY_STATE_SOURCE_MAX_LENGTH - 1)
    .join("")
    .trimEnd()}…`;
}

/** Short, single-line source excerpt for empty states that must name the string. */
export function emptyStateSourceLabel(sourceText: string | null | undefined) {
  const normalized = formatInternalMarkupForDisplay(sourceText ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return null;
  }
  return truncateSourceLabel(normalized);
}
