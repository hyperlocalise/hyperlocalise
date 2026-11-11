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

import { catTranslationMemorySegmentAccess } from "./content-editor-tm-segment";

const nativeMatch = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  memoryId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  matchSource: "synced_database" as const,
  providerKind: null,
  resourceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  externalResourceId: null,
  externalSegmentId: null,
};

describe("catTranslationMemorySegmentAccess", () => {
  it("allows native approved database matches", () => {
    expect(catTranslationMemorySegmentAccess(nativeMatch)).toEqual({
      canEdit: true,
      canDelete: true,
      segmentRef: {
        kind: "native",
        memoryId: nativeMatch.memoryId,
        entryId: nativeMatch.id,
      },
    });
  });

  it("allows Crowdin live matches with a TM and record id", () => {
    expect(
      catTranslationMemorySegmentAccess({
        id: "live:crowdin:4:12:fr",
        memoryId: "live:crowdin:4",
        matchSource: "live_provider",
        providerKind: "crowdin",
        resourceId: "4",
        externalResourceId: "4",
        externalSegmentId: "12",
      }),
    ).toEqual({
      canEdit: true,
      canDelete: true,
      segmentRef: {
        kind: "external",
        providerKind: "crowdin",
        resourceId: "4",
        externalResourceId: "4",
        externalSegmentId: "12",
      },
    });
  });

  it("hides mirrored external rows and unsupported providers", () => {
    expect(
      catTranslationMemorySegmentAccess({
        ...nativeMatch,
        providerKind: "crowdin",
      }),
    ).toEqual({ canEdit: false, canDelete: false });

    expect(
      catTranslationMemorySegmentAccess({
        id: "live:lokalise:1:key",
        memoryId: "live:lokalise:1",
        matchSource: "live_provider",
        providerKind: "lokalise",
        resourceId: "1",
        externalResourceId: "1",
        externalSegmentId: "99",
      }),
    ).toEqual({ canEdit: false, canDelete: false });
  });
});
