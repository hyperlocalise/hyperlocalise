import type { ProjectFileCatQueueFilter } from "@/api/routes/project/project.schema";

import type { CatSegment } from "@/components/cat/shared/types";

export type CatQueueFilter = ProjectFileCatQueueFilter | "skipped";

export type CatSegmentFilterInput = {
  status: CatSegment["status"];
  hasOpenIssues?: boolean;
};

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

export function isQueueFilterSupportedForProvider(
  filter: CatQueueFilter,
  providerKind: string | null | undefined,
) {
  if (filter === "has_issues") {
    return providerKind === "crowdin" || providerKind === null;
  }

  if (
    (providerKind === "phrase" || providerKind === "lokalise") &&
    (filter === "untranslated" || filter === "needs_review" || filter === "reviewed")
  ) {
    return false;
  }

  return true;
}

export function resolveAvailableCatQueueFilters(
  providerKind: string | null | undefined,
): CatQueueFilter[] {
  return catQueueFilterValues.filter((filter) =>
    isQueueFilterSupportedForProvider(filter, providerKind),
  );
}

export function resolveVisibleQueueSegments(
  segments: CatSegment[],
  queueFilter: CatQueueFilter,
  usesServerQueueFilter: boolean,
) {
  if (usesServerQueueFilter && isServerQueueFilter(queueFilter)) {
    return segments;
  }

  return filterCatQueueSegments(segments, queueFilter);
}

export function findSegmentIdByKeyOrIdInQueue(
  segments: Pick<CatSegment, "id" | "key">[],
  segmentIdOrKey: string,
) {
  const match = segments.find(
    (segment) => segment.id === segmentIdOrKey || segment.key === segmentIdOrKey,
  );

  return match?.id ?? null;
}

export function findSegmentIdByKeyOrId(segments: CatSegment[], segmentIdOrKey: string) {
  return findSegmentIdByKeyOrIdInQueue(segments, segmentIdOrKey);
}

export function isOpenIssueStatus(status: string | null | undefined) {
  return status === "open" || status === "unresolved";
}

export function segmentHasOpenIssues(segment: CatSegment) {
  if (segment.hasOpenIssues) {
    return true;
  }

  return (
    segment.comments?.some(
      (comment) => comment.type === "issue" && isOpenIssueStatus(comment.status),
    ) ?? false
  );
}

export function segmentHasOpenIssuesFromInput(input: CatSegmentFilterInput) {
  if (input.hasOpenIssues) {
    return true;
  }

  return false;
}

export function segmentMatchesQueueFilterFromInput(
  input: CatSegmentFilterInput,
  filter: CatQueueFilter,
) {
  switch (filter) {
    case "all":
      return true;
    case "untranslated":
      return input.status === "pending";
    case "needs_review":
      return input.status === "needs_review" && !segmentHasOpenIssuesFromInput(input);
    case "reviewed":
      return input.status === "reviewed";
    case "has_issues":
      return segmentHasOpenIssuesFromInput(input);
    case "skipped":
      return input.status === "skipped";
    default:
      return true;
  }
}

export function segmentMatchesQueueFilter(segment: CatSegment, filter: CatQueueFilter) {
  return segmentMatchesQueueFilterFromInput(
    {
      status: segment.status,
      hasOpenIssues: segmentHasOpenIssues(segment),
    },
    filter,
  );
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
