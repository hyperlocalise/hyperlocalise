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
  ProjectFileCatQueueFilter,
  ProjectFileCatQueueSort,
} from "@/api/routes/project/project.schema";

import type { CatSegment } from "@/components/cat/shared/types";

export type CatQueueFilter = ProjectFileCatQueueFilter | "skipped" | "unsaved";
export type CatQueueSort = ProjectFileCatQueueSort;

export type CatSegmentFilterInput = {
  status: CatSegment["status"];
  hasOpenIssues?: boolean;
  isHidden?: boolean;
  isDirty?: boolean;
};

export const catQueueFilterValues: CatQueueFilter[] = [
  "all",
  "untranslated",
  "needs_review",
  "reviewed",
  "unsaved",
  "qa_issues",
  "machine_translated",
  "with_comments",
  "has_issues",
  "skipped",
  "hidden",
];

export const catQueueSortValues: CatQueueSort[] = ["file_order", "untranslated_first"];

export function isServerQueueFilter(filter: CatQueueFilter): filter is ProjectFileCatQueueFilter {
  return filter !== "skipped" && filter !== "unsaved";
}

export function isQueueFilterSupportedForProvider(
  filter: CatQueueFilter,
  providerKind: string | null | undefined,
) {
  if (filter === "hidden") {
    return providerKind == null || providerKind === "native" || providerKind === "crowdin";
  }

  if (filter === "has_issues") {
    return providerKind === "crowdin" || providerKind === "smartling" || providerKind === null;
  }

  if (filter === "qa_issues" || filter === "machine_translated" || filter === "with_comments") {
    return providerKind === "crowdin";
  }

  if (
    (providerKind === "phrase" || providerKind === "lokalise" || providerKind === "smartling") &&
    (filter === "untranslated" || filter === "needs_review" || filter === "reviewed")
  ) {
    return false;
  }

  return true;
}

export function isQueueSortSupportedForProvider(
  sort: CatQueueSort,
  providerKind: string | null | undefined,
) {
  if (sort === "file_order") {
    return true;
  }

  return providerKind == null || providerKind === "native" || providerKind === "crowdin";
}

export function resolveAvailableCatQueueFilters(
  providerKind: string | null | undefined,
): CatQueueFilter[] {
  return catQueueFilterValues.filter((filter) =>
    isQueueFilterSupportedForProvider(filter, providerKind),
  );
}

export function resolveAvailableCatQueueSorts(
  providerKind: string | null | undefined,
): CatQueueSort[] {
  return catQueueSortValues.filter((sort) => isQueueSortSupportedForProvider(sort, providerKind));
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

export function orderCatQueueSegmentsSkippedLast<T>(
  segments: T[],
  queueSort: CatQueueSort,
  isSkipped: (segment: T) => boolean,
) {
  if (queueSort !== "untranslated_first") {
    return segments;
  }

  const rest: T[] = [];
  const skipped: T[] = [];
  for (const segment of segments) {
    if (isSkipped(segment)) {
      skipped.push(segment);
    } else {
      rest.push(segment);
    }
  }

  return [...rest, ...skipped];
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
  return status === "open" || status === "unresolved" || status === "in_progress";
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
      // Hidden TMS strings are not translator queue work.
      return input.status === "pending" && !input.isHidden;
    case "needs_review":
      return input.status === "needs_review" && !segmentHasOpenIssuesFromInput(input);
    case "reviewed":
      return input.status === "reviewed";
    case "unsaved":
      return Boolean(input.isDirty);
    case "has_issues":
      return segmentHasOpenIssuesFromInput(input);
    case "skipped":
      return input.status === "skipped";
    case "hidden":
      return Boolean(input.isHidden);
    case "qa_issues":
    case "machine_translated":
    case "with_comments":
      // Crowdin CroQL is the source of truth; keep locally overridden rows visible.
      return true;
    default:
      return true;
  }
}

export function segmentMatchesQueueFilter(segment: CatSegment, filter: CatQueueFilter) {
  return segmentMatchesQueueFilterFromInput(
    {
      status: segment.status,
      hasOpenIssues: segmentHasOpenIssues(segment),
      isHidden: segment.isHidden,
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
