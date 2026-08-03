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
import type { VersionedDocumentRevisionMetadata } from "./versioned-document.types";

/**
 * Merges a "current head" row (0 or 1) with a page of archived rows into one revision list,
 * deduplicating by revisionId — a revision can move from head to archive between the two reads,
 * so current metadata wins on conflict. Pure function: each resource still owns its own SELECT
 * queries against its own concrete tables; this only owns the merge/sort/paginate logic.
 */
export function mergeVersionedDocumentRevisionPage(input: {
  currentRevisions: VersionedDocumentRevisionMetadata[];
  archivedRevisions: VersionedDocumentRevisionMetadata[];
  limit: number;
}): { revisions: VersionedDocumentRevisionMetadata[]; nextCursor: number | null } {
  const revisions = [
    ...new Map(
      [...input.archivedRevisions, ...input.currentRevisions].map(
        (revision) => [revision.revisionId, revision] as const,
      ),
    ).values(),
  ].sort((left, right) => right.version - left.version);

  const page = revisions.slice(0, input.limit);
  const nextCursor = revisions.length > input.limit ? (page.at(-1)?.version ?? null) : null;

  return { revisions: page, nextCursor };
}
