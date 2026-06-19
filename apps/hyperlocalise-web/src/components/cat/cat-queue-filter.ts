import type { ProjectFileCatQueueFilter } from "@/api/routes/project/project.schema";

import type { CatSegment } from "./types";

export type CatQueueFilter = ProjectFileCatQueueFilter | "skipped";

export const catQueueFilterValues: CatQueueFilter[] = [
  "all",
  "untranslated",
  "needs_review",
  "reviewed",
  "has_issues",
  "skipped",
];

export function isServerQueueFilter(filter: CatQueueFilter): filter is ProjectFileCatQueueFilter {
  return filter !== "skipped";
}

export function findSegmentIdByKeyOrId(segments: CatSegment[], segmentIdOrKey: string) {
  const match = segments.find(
    (segment) => segment.id === segmentIdOrKey || segment.key === segmentIdOrKey,
  );

  return match?.id ?? null;
}

export function segmentHasOpenIssues(segment: CatSegment) {
  return (
    segment.comments?.some((comment) => comment.type === "issue" && comment.status === "open") ??
    false
  );
}

export function segmentMatchesQueueFilter(segment: CatSegment, filter: CatQueueFilter) {
  switch (filter) {
    case "all":
      return true;
    case "untranslated":
      return segment.status === "pending";
    case "needs_review":
      return segment.status === "needs_review" && !segmentHasOpenIssues(segment);
    case "reviewed":
      return segment.status === "reviewed";
    case "has_issues":
      return segmentHasOpenIssues(segment);
    case "skipped":
      return segment.status === "skipped";
    default:
      return true;
  }
}

export function filterCatQueueSegments(segments: CatSegment[], filter: CatQueueFilter) {
  if (filter === "all") {
    return segments;
  }

  return segments.filter((segment) => segmentMatchesQueueFilter(segment, filter));
}

export function resolveSelectedSegmentId(
  segments: CatSegment[],
  preferredSegmentIdOrKey: string | null | undefined,
  fallbackSegmentId: string,
) {
  if (!preferredSegmentIdOrKey) {
    return fallbackSegmentId;
  }

  return findSegmentIdByKeyOrId(segments, preferredSegmentIdOrKey) ?? fallbackSegmentId;
}
