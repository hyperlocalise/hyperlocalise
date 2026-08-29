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
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";

// Segments of these kinds carry a repository source file id as their external
// string id, not a `project_translation_keys` row id.
const FILE_BACKED_CONTENT_KINDS = new Set<NonNullable<ContentEditorSegment["contentKind"]>>([
  "image_file",
  "video_file",
  "office_file",
]);

export function isFileBackedCatSegment(contentKind: ContentEditorSegment["contentKind"]) {
  return contentKind != null && FILE_BACKED_CONTENT_KINDS.has(contentKind);
}

/**
 * Resolve the translation key an Issue can link to for a CAT segment. Only
 * native text segments expose their translation key id as the segment id;
 * provider-backed queues and file-backed segments have no translation key.
 */
export function resolveCatLinkedIssueTranslationKeyId(input: {
  isNativeProject: boolean;
  segmentId: string;
  contentKind: ContentEditorSegment["contentKind"];
}): string | null {
  if (!input.isNativeProject) {
    return null;
  }

  if (isFileBackedCatSegment(input.contentKind)) {
    return null;
  }

  return input.segmentId || null;
}
