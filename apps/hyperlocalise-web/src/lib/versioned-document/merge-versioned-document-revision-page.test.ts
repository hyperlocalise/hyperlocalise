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
import { describe, expect, it } from "vite-plus/test";

import { mergeVersionedDocumentRevisionPage } from "./merge-versioned-document-revision-page";
import type { VersionedDocumentRevisionMetadata } from "./versioned-document.types";

function revision(
  input: Pick<VersionedDocumentRevisionMetadata, "revisionId" | "version" | "isCurrent"> &
    Partial<VersionedDocumentRevisionMetadata>,
): VersionedDocumentRevisionMetadata {
  return {
    summary: input.summary ?? `v${input.version}`,
    createdAt: input.createdAt ?? "2026-08-01T00:00:00.000Z",
    createdByUserId: input.createdByUserId ?? "user_1",
    createdByName: input.createdByName ?? "Ada",
    revisionId: input.revisionId,
    version: input.version,
    isCurrent: input.isCurrent,
  };
}

describe("mergeVersionedDocumentRevisionPage", () => {
  it("prefers current-head metadata when a revision also appears in the archive page", () => {
    const archived = revision({
      revisionId: "rev_shared",
      version: 3,
      isCurrent: false,
      summary: "archived copy",
    });
    const current = revision({
      revisionId: "rev_shared",
      version: 3,
      isCurrent: true,
      summary: "current head wins",
    });

    const page = mergeVersionedDocumentRevisionPage({
      currentRevisions: [current],
      archivedRevisions: [archived],
      limit: 10,
    });

    expect(page.revisions).toHaveLength(1);
    expect(page.revisions[0]).toMatchObject({
      revisionId: "rev_shared",
      summary: "current head wins",
      isCurrent: true,
    });
    expect(page.nextCursor).toBeNull();
  });

  it("sorts by version descending and pages with a nextCursor", () => {
    const revisions = [
      revision({ revisionId: "rev_1", version: 1, isCurrent: false }),
      revision({ revisionId: "rev_3", version: 3, isCurrent: true }),
      revision({ revisionId: "rev_2", version: 2, isCurrent: false }),
      revision({ revisionId: "rev_4", version: 4, isCurrent: false }),
    ];

    const page = mergeVersionedDocumentRevisionPage({
      currentRevisions: [revisions[1]!],
      archivedRevisions: [revisions[0]!, revisions[2]!, revisions[3]!],
      limit: 2,
    });

    expect(page.revisions.map((item) => item.version)).toEqual([4, 3]);
    expect(page.nextCursor).toBe(3);
  });

  it("returns null nextCursor when the merged set fits in one page", () => {
    const page = mergeVersionedDocumentRevisionPage({
      currentRevisions: [revision({ revisionId: "rev_2", version: 2, isCurrent: true })],
      archivedRevisions: [revision({ revisionId: "rev_1", version: 1, isCurrent: false })],
      limit: 2,
    });

    expect(page.revisions).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });
});
