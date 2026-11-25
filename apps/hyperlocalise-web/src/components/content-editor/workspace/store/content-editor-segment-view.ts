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
import { stripLeakedInternalMarkupFromStoredMessage } from "@/components/content-editor/message-format/content-editor-internal-markup";
import { isOpenIssueStatus } from "@/components/content-editor/queue/content-editor-queue-filter";
import type {
  ContentEditorFileContext,
  ContentEditorQueueSegment,
  ContentEditorSegment,
  ContentEditorSegmentComment,
  ContentEditorSegmentIntelligence,
} from "@/components/content-editor/shared/types";

import type { ContentEditorSegmentDraft } from "./content-editor-segment-draft";

function lazyCommentFields(
  segmentType: string | undefined,
  comments: ContentEditorSegmentComment[] | undefined,
  openIssueCountFromSheet: number | undefined,
) {
  if (comments === undefined && openIssueCountFromSheet === undefined) {
    return segmentType ? { tags: [segmentType] } : {};
  }

  const commentIssueCount =
    comments?.filter((comment) => comment.type === "issue" && isOpenIssueStatus(comment.status))
      .length ?? 0;
  const issueCount = Math.max(commentIssueCount, openIssueCountFromSheet ?? 0);
  const commentCount = comments?.length ?? 0;
  const tags = [
    segmentType,
    comments !== undefined && commentCount > 0
      ? `${commentCount} comment${commentCount === 1 ? "" : "s"}`
      : null,
    issueCount > 0 ? `${issueCount} issue${issueCount === 1 ? "" : "s"}` : null,
  ].filter((tag): tag is string => Boolean(tag));

  return {
    ...(comments !== undefined ? { comments } : {}),
    hasOpenIssues: issueCount > 0,
    tags,
  };
}

export function composeSegmentView(input: {
  fileContext: ContentEditorFileContext;
  meta: ContentEditorQueueSegment;
  draft: Pick<ContentEditorSegmentDraft, "targetText" | "status"> | undefined;
  comments: ContentEditorSegmentComment[] | undefined;
  openIssueCount?: number;
  intelligence: ContentEditorSegmentIntelligence | undefined;
}): ContentEditorSegment {
  const { fileContext, meta, draft, comments, openIssueCount, intelligence } = input;
  const segmentType = intelligence?.segmentType;
  const contextLabel = intelligence?.productMeaning?.trim() || undefined;
  const maxLength =
    intelligence?.maxLength != null && intelligence.maxLength > 0
      ? intelligence.maxLength
      : undefined;

  const messageFormat = meta.messageFormat ?? fileContext.messageFormat;
  const placeholderPatterns = meta.placeholderPatterns ?? fileContext.placeholderPatterns;

  return {
    ...meta,
    ...(messageFormat ? { messageFormat } : {}),
    ...(placeholderPatterns?.length ? { placeholderPatterns } : {}),
    sourceLocale: fileContext.sourceLocale,
    targetLocale: fileContext.targetLocale,
    targetText: stripLeakedInternalMarkupFromStoredMessage(draft?.targetText ?? ""),
    status: draft?.status ?? "pending",
    ...(contextLabel ? { contextLabel } : {}),
    ...(maxLength != null ? { maxLength } : {}),
    ...lazyCommentFields(segmentType, comments, openIssueCount),
  };
}

/**
 * The same view as {@link composeSegmentView}, but every field that can change
 * is a getter that reads the store only when an observer touches it. The
 * object keeps its identity while the user types, so observers that only use
 * the id, key or source do not re-render on each keystroke.
 */
export function composeLazySegmentView(
  meta: ContentEditorQueueSegment,
  read: {
    fileContext: () => ContentEditorFileContext;
    draft: () => Pick<ContentEditorSegmentDraft, "targetText" | "status"> | undefined;
    comments: () => ContentEditorSegmentComment[] | undefined;
    openIssueCount: () => number | undefined;
    intelligence: () => ContentEditorSegmentIntelligence | undefined;
  },
): ContentEditorSegment {
  const base: Partial<ContentEditorSegment> = meta;
  const commentFields = (): Partial<ContentEditorSegment> =>
    lazyCommentFields(read.intelligence()?.segmentType, read.comments(), read.openIssueCount());

  return {
    ...meta,
    get messageFormat() {
      return meta.messageFormat ?? read.fileContext().messageFormat;
    },
    get placeholderPatterns() {
      const patterns = meta.placeholderPatterns ?? read.fileContext().placeholderPatterns;
      return patterns?.length ? patterns : meta.placeholderPatterns;
    },
    get sourceLocale() {
      return read.fileContext().sourceLocale;
    },
    get targetLocale() {
      return read.fileContext().targetLocale;
    },
    get targetText() {
      return stripLeakedInternalMarkupFromStoredMessage(read.draft()?.targetText ?? "");
    },
    get status() {
      return read.draft()?.status ?? "pending";
    },
    get contextLabel() {
      return read.intelligence()?.productMeaning?.trim() || base.contextLabel;
    },
    get maxLength() {
      const maxLength = read.intelligence()?.maxLength;
      return maxLength != null && maxLength > 0 ? maxLength : base.maxLength;
    },
    get comments() {
      const fields = commentFields();
      return "comments" in fields ? fields.comments : base.comments;
    },
    get hasOpenIssues() {
      const fields = commentFields();
      return "hasOpenIssues" in fields ? fields.hasOpenIssues : base.hasOpenIssues;
    },
    get tags() {
      const fields = commentFields();
      return "tags" in fields ? fields.tags : base.tags;
    },
  };
}

export function toQueueSegment(
  segment: Pick<
    ContentEditorSegment,
    | "id"
    | "index"
    | "key"
    | "sourceText"
    | "sourcePath"
    | "messageFormat"
    | "placeholderPatterns"
    | "contentKind"
    | "sourceAssetUrl"
    | "targetAssetUrl"
    | "imageVariantId"
    | "looksLikeImageUrl"
    | "looksLikeVideoUrl"
    | "sourceTextEditable"
    | "isHidden"
    | "isLocked"
    | "occurrenceCount"
    | "groupStatus"
    | "divergentLocales"
  >,
): ContentEditorQueueSegment {
  return {
    id: segment.id,
    index: segment.index,
    key: segment.key,
    sourceText: segment.sourceText,
    ...(segment.sourcePath ? { sourcePath: segment.sourcePath } : {}),
    ...(segment.messageFormat ? { messageFormat: segment.messageFormat } : {}),
    ...(segment.placeholderPatterns?.length
      ? { placeholderPatterns: segment.placeholderPatterns }
      : {}),
    ...(segment.contentKind ? { contentKind: segment.contentKind } : {}),
    ...(segment.sourceAssetUrl !== undefined ? { sourceAssetUrl: segment.sourceAssetUrl } : {}),
    ...(segment.targetAssetUrl !== undefined ? { targetAssetUrl: segment.targetAssetUrl } : {}),
    ...(segment.imageVariantId !== undefined ? { imageVariantId: segment.imageVariantId } : {}),
    ...(segment.looksLikeImageUrl !== undefined
      ? { looksLikeImageUrl: segment.looksLikeImageUrl }
      : {}),
    ...(segment.looksLikeVideoUrl !== undefined
      ? { looksLikeVideoUrl: segment.looksLikeVideoUrl }
      : {}),
    ...(segment.isHidden ? { isHidden: true } : {}),
    ...(segment.isLocked ? { isLocked: true } : {}),
    ...(segment.sourceTextEditable ? { sourceTextEditable: true } : {}),
    ...(segment.occurrenceCount ? { occurrenceCount: segment.occurrenceCount } : {}),
    ...(segment.groupStatus ? { groupStatus: segment.groupStatus } : {}),
    ...(segment.divergentLocales?.length ? { divergentLocales: segment.divergentLocales } : {}),
  };
}
