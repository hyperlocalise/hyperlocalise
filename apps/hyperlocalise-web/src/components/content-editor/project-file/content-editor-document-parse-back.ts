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
import type {
  CatDocumentParseBackResponse,
  CatDocumentUnmapped,
} from "@/lib/go-svc/go-svc-cat-document.types";

const DOCUMENT_DRAFT_SAVE_CONCURRENCY = 4;

const PARSE_BACK_EXTENSION_PATTERN = /\.(md|mdx|html)$/i;

export function isParseBackDocumentPath(sourcePath: string) {
  return PARSE_BACK_EXTENSION_PATTERN.test(sourcePath);
}

export type DocumentParseBackResult = {
  saved: number;
  failed: { key: string; message: string }[];
  unmapped: CatDocumentUnmapped[];
};

/**
 * Saves each segment the edited document changed as a draft. A failed save, for example one
 * blocked by QA, is reported with the edits that did not map to a segment.
 */
export async function saveDocumentParseBackDrafts(input: {
  parse: () => Promise<CatDocumentParseBackResponse>;
  saveDraft: (externalStringId: string, targetText: string) => Promise<unknown>;
}): Promise<DocumentParseBackResult> {
  const { changes, unmapped } = await input.parse();
  const result: DocumentParseBackResult = { saved: 0, failed: [], unmapped };
  for (let start = 0; start < changes.length; start += DOCUMENT_DRAFT_SAVE_CONCURRENCY) {
    const batch = changes.slice(start, start + DOCUMENT_DRAFT_SAVE_CONCURRENCY);
    const outcomes = await Promise.allSettled(
      batch.map((change) => input.saveDraft(change.externalStringId, change.targetText)),
    );
    outcomes.forEach((outcome, index) => {
      if (outcome.status === "fulfilled") {
        result.saved += 1;
        return;
      }
      result.failed.push({
        key: batch[index]!.key,
        message: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      });
    });
  }
  return result;
}
