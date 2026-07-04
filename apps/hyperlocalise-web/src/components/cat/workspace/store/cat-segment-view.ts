import { isOpenIssueStatus } from "@/components/cat/queue/cat-queue-filter";
import type {
  CatFileContext,
  CatQueueSegment,
  CatSegment,
  CatSegmentComment,
  CatSegmentIntelligence,
} from "@/components/cat/shared/types";

import type { CatSegmentDraft } from "./cat-segment-draft";

function lazyCommentFields(
  segmentType: string | undefined,
  comments: CatSegmentComment[] | undefined,
) {
  if (comments === undefined) {
    return segmentType ? { tags: [segmentType] } : {};
  }

  const issueCount = comments.filter(
    (comment) => comment.type === "issue" && isOpenIssueStatus(comment.status),
  ).length;
  const tags = [
    segmentType,
    comments.length > 0 ? `${comments.length} comment${comments.length === 1 ? "" : "s"}` : null,
    issueCount > 0 ? `${issueCount} issue${issueCount === 1 ? "" : "s"}` : null,
  ].filter((tag): tag is string => Boolean(tag));

  return {
    comments,
    hasOpenIssues: issueCount > 0,
    tags,
  };
}

export function composeSegmentView(input: {
  fileContext: CatFileContext;
  meta: CatQueueSegment;
  draft: CatSegmentDraft | undefined;
  comments: CatSegmentComment[] | undefined;
  intelligence: CatSegmentIntelligence | undefined;
}): CatSegment {
  const { fileContext, meta, draft, comments, intelligence } = input;
  const segmentType = intelligence?.segmentType;
  const contextLabel = intelligence?.productMeaning?.trim() || undefined;
  const maxLength =
    intelligence?.maxLength != null && intelligence.maxLength > 0
      ? intelligence.maxLength
      : undefined;

  return {
    ...meta,
    sourceLocale: fileContext.sourceLocale,
    targetLocale: fileContext.targetLocale,
    targetText: draft?.targetText ?? "",
    status: draft?.status ?? "pending",
    ...(contextLabel ? { contextLabel } : {}),
    ...(maxLength != null ? { maxLength } : {}),
    ...lazyCommentFields(segmentType, comments),
  };
}

export function toQueueSegment(
  segment: Pick<CatSegment, "id" | "index" | "key" | "sourceText">,
): CatQueueSegment {
  return {
    id: segment.id,
    index: segment.index,
    key: segment.key,
    sourceText: segment.sourceText,
  };
}
