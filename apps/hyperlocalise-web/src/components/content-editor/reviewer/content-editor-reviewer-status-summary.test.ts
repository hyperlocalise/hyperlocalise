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

import type {
  ContentEditorFormatCheck,
  ContentEditorSegment,
} from "@/components/content-editor/shared/types";

import {
  segmentHasReviewerIssue,
  summarizeReviewerSegmentStatuses,
} from "./content-editor-reviewer-status-summary";

function createSegment(
  id: string,
  overrides: Partial<ContentEditorSegment> = {},
): ContentEditorSegment {
  return {
    id,
    index: 1,
    key: `key-${id}`,
    sourceText: "Hello",
    targetText: "Bonjour",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    status: "pending",
    ...overrides,
  };
}

describe("summarizeReviewerSegmentStatuses", () => {
  it("tallies segments across all review statuses correctly", () => {
    const segments: ContentEditorSegment[] = [
      createSegment("1", { status: "reviewed" }),
      createSegment("2", { status: "reviewed" }),
      createSegment("3", { status: "needs_review" }),
      createSegment("4", { status: "pending" }),
      createSegment("5", { status: "skipped" }),
    ];

    const summary = summarizeReviewerSegmentStatuses(segments);

    expect(summary).toEqual({
      total: 5,
      reviewed: 2,
      needsReview: 1,
      pending: 1,
      skipped: 1,
      withIssues: 0,
    });
  });

  it("identifies segments with issues from open comments or failed checks", () => {
    const checkPass: ContentEditorFormatCheck = {
      id: "c1",
      label: "Placeholders",
      status: "pass",
      message: "Placeholders are valid",
      category: "placeholder",
    };
    const checkFail: ContentEditorFormatCheck = {
      id: "c2",
      label: "Placeholders",
      status: "fail",
      message: "Missing placeholder {name}",
      category: "placeholder",
    };

    const segments: ContentEditorSegment[] = [
      createSegment("1", { status: "reviewed", hasOpenIssues: true }),
      createSegment("2", { status: "needs_review" }),
      createSegment("3", {
        status: "pending",
        comments: [
          {
            id: "comm-1",
            author: "QA",
            text: "Grammar mistake",
            createdAt: new Date().toISOString(),
            type: "issue",
            status: "open",
            locale: "es",
          },
        ],
      }),
    ];

    const checksMap: Record<string, ContentEditorFormatCheck[]> = {
      "1": [checkPass],
      "2": [checkFail],
      "3": [checkPass],
    };

    const summary = summarizeReviewerSegmentStatuses(segments, checksMap);

    expect(summary.total).toBe(3);
    expect(summary.reviewed).toBe(1);
    expect(summary.needsReview).toBe(1);
    expect(summary.pending).toBe(1);
    expect(summary.withIssues).toBe(3);
  });
});

describe("segmentHasReviewerIssue", () => {
  it("returns true when segment has hasOpenIssues set", () => {
    const segment = createSegment("1", { hasOpenIssues: true });
    expect(segmentHasReviewerIssue(segment)).toBe(true);
  });

  it("returns true when segment has a failed format check", () => {
    const segment = createSegment("1");
    const checkFail: ContentEditorFormatCheck = {
      id: "c1",
      label: "Format",
      status: "fail",
      message: "Format error",
      category: "placeholder",
    };
    expect(segmentHasReviewerIssue(segment, [checkFail])).toBe(true);
  });

  it("returns false when format checks only have warnings or passes", () => {
    const segment = createSegment("1");
    const checkWarn: ContentEditorFormatCheck = {
      id: "c1",
      label: "Format",
      status: "warn",
      message: "Format warning",
      category: "placeholder",
    };
    const checkPass: ContentEditorFormatCheck = {
      id: "c2",
      label: "Length",
      status: "pass",
      message: "Length ok",
      category: "length",
    };
    expect(segmentHasReviewerIssue(segment, [checkWarn, checkPass])).toBe(false);
  });
});
