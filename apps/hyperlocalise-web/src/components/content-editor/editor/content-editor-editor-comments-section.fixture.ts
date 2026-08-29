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
  ContentEditorSegment,
  ContentEditorSegmentComment,
} from "@/components/content-editor/shared/types";

export const contentEditorEditorCommentsSegmentId = "11111111-1111-4111-8111-111111111111";

export const contentEditorEditorCommentsFixture: ContentEditorSegmentComment[] = [
  {
    id: "comment-note-1",
    type: "comment",
    status: null,
    text: "Keep the tone closer to product marketing copy.",
    createdAt: "2026-06-10T09:15:00.000Z",
    locale: "ja-JP",
    author: "Alex Reviewer",
  },
  {
    id: "issue-open-1",
    type: "issue",
    status: "unresolved",
    text: "Is “Social:” meant as a section label or a form field?",
    createdAt: "2026-06-11T14:30:00.000Z",
    locale: "ja-JP",
    author: "Mina Translator",
  },
  {
    id: "issue-resolved-1",
    type: "issue",
    status: "resolved",
    text: "Source key looks truncated in the design mock.",
    createdAt: "2026-06-09T11:00:00.000Z",
    locale: "ja-JP",
    author: "Sam PM",
  },
];

export function createCatEditorCommentsSegment(
  overrides: Partial<ContentEditorSegment> & { comments?: ContentEditorSegmentComment[] } = {},
): ContentEditorSegment {
  return {
    id: contentEditorEditorCommentsSegmentId,
    index: 2,
    key: "0Flpdy",
    sourceText: "Social:",
    targetText: "ソーシャル：",
    sourceLocale: "en-US",
    targetLocale: "ja-JP",
    sourcePath: "lang/en-US.json",
    status: "needs_review",
    comments: [],
    ...overrides,
  };
}
