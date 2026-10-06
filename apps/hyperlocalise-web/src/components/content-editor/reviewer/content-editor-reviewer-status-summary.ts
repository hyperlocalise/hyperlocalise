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
import { segmentHasOpenIssues } from "@/components/content-editor/queue/content-editor-queue-filter";
import type {
  ContentEditorFormatCheck,
  ContentEditorSegment,
} from "@/components/content-editor/shared/types";

export type ContentEditorReviewerStatusSummary = {
  total: number;
  reviewed: number;
  needsReview: number;
  pending: number;
  skipped: number;
  withIssues: number;
};

/**
 * True when a segment should be flagged as a QA problem in the Reviewer layout:
 * it has an open linked issue, or a completed format/QA check failed.
 */
export function segmentHasReviewerIssue(
  segment: ContentEditorSegment,
  formatChecks?: readonly ContentEditorFormatCheck[],
): boolean {
  if (segmentHasOpenIssues(segment)) {
    return true;
  }
  return formatChecks?.some((check) => check.status === "fail") ?? false;
}

/**
 * Counts loaded segments by review status for the Reviewer status bar.
 * Only loaded rows are counted — the queue is paginated and the server does
 * not return per-status totals, so callers append "+" when more pages exist.
 */
export function summarizeReviewerSegmentStatuses(
  segments: readonly ContentEditorSegment[],
  segmentFormatChecks?: Readonly<Record<string, readonly ContentEditorFormatCheck[]>>,
): ContentEditorReviewerStatusSummary {
  const summary: ContentEditorReviewerStatusSummary = {
    total: segments.length,
    reviewed: 0,
    needsReview: 0,
    pending: 0,
    skipped: 0,
    withIssues: 0,
  };

  for (const segment of segments) {
    switch (segment.status) {
      case "reviewed":
        summary.reviewed += 1;
        break;
      case "needs_review":
        summary.needsReview += 1;
        break;
      case "skipped":
        summary.skipped += 1;
        break;
      default:
        summary.pending += 1;
        break;
    }
    if (segmentHasReviewerIssue(segment, segmentFormatChecks?.[segment.id])) {
      summary.withIssues += 1;
    }
  }

  return summary;
}
