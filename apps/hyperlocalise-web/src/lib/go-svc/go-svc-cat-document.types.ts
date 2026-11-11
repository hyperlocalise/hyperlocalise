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

export interface CatDocumentParseBackBody {
  sourcePath: string;
  targetLocale: string;
  /** The edited target document. */
  content: string;
}

/** A segment whose text differs in the edited document. */
export interface CatDocumentChange {
  externalStringId: string;
  key: string;
  targetText: string;
}

/**
 * `unknown_key`: the edit added or restructured a block, so no segment has its key.
 * `missing`: the edit removed a block that has a segment.
 * `split_into_sentences`: the paragraph is stored as sentence segments, which a whole
 * paragraph edit cannot be split back into.
 */
export type CatDocumentUnmappedReason = "unknown_key" | "missing" | "split_into_sentences";

export interface CatDocumentUnmapped {
  key: string;
  text: string;
  reason: CatDocumentUnmappedReason;
}

export interface CatDocumentParseBackResponse {
  changes: CatDocumentChange[];
  unmapped: CatDocumentUnmapped[];
}
