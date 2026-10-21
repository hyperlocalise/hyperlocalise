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
import type { ContentEditorTmSegmentRef } from "@/components/content-editor/shared/types";
import type { NormalizedTranslationMemoryMatch } from "@/lib/providers/contracts/translation-memory-match";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export type ContentEditorTmSegmentAccess = {
  canEdit: boolean;
  canDelete: boolean;
  segmentRef?: ContentEditorTmSegmentRef;
};

export function catTranslationMemorySegmentAccess(
  match: Pick<
    NormalizedTranslationMemoryMatch,
    | "id"
    | "memoryId"
    | "matchSource"
    | "providerKind"
    | "resourceId"
    | "externalResourceId"
    | "externalSegmentId"
  >,
): ContentEditorTmSegmentAccess {
  if (
    match.matchSource === "synced_database" &&
    match.providerKind === null &&
    isUuid(match.memoryId) &&
    isUuid(match.id)
  ) {
    return {
      canEdit: true,
      canDelete: true,
      segmentRef: {
        kind: "native",
        memoryId: match.memoryId,
        entryId: match.id,
      },
    };
  }

  if (
    match.matchSource === "live_provider" &&
    match.providerKind === "crowdin" &&
    Boolean(match.externalResourceId?.trim()) &&
    Boolean(match.externalSegmentId?.trim())
  ) {
    return {
      canEdit: true,
      canDelete: true,
      segmentRef: {
        kind: "external",
        providerKind: "crowdin",
        resourceId: match.resourceId,
        externalResourceId: match.externalResourceId as string,
        externalSegmentId: match.externalSegmentId as string,
      },
    };
  }

  return { canEdit: false, canDelete: false };
}

export type ContentEditorTmSegmentRecord = {
  id: string;
  locale: string;
  text: string;
  isSource: boolean;
  version?: number;
};

export type ContentEditorTmSegment = {
  source: ContentEditorTmSegmentRecord;
  records: ContentEditorTmSegmentRecord[];
};
