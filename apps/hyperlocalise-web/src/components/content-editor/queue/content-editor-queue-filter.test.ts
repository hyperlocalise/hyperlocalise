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

import {
  filterCatQueueSegments,
  findSegmentIdByKeyOrId,
  orderCatQueueSegmentsSkippedLast,
  resolveAvailableCatQueueFilters,
  resolveAvailableCatQueueSorts,
  resolveSelectedSegmentId,
  resolveVisibleQueueSegments,
  segmentMatchesQueueFilter,
  segmentMatchesQueueFilterFromInput,
} from "./content-editor-queue-filter";
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";

function createSegment(overrides: Partial<ContentEditorSegment> = {}): ContentEditorSegment {
  return {
    id: "seg-1",
    index: 1,
    key: "app.title",
    sourceText: "Hello",
    targetText: "",
    sourceLocale: "en",
    targetLocale: "vi",
    status: "pending",
    ...overrides,
  };
}

describe("segmentMatchesQueueFilter", () => {
  it("matches untranslated pending segments", () => {
    expect(segmentMatchesQueueFilter(createSegment({ status: "pending" }), "untranslated")).toBe(
      true,
    );
    expect(
      segmentMatchesQueueFilter(createSegment({ status: "needs_review" }), "untranslated"),
    ).toBe(false);
  });

  it("does not treat hidden pending segments as untranslated work", () => {
    expect(
      segmentMatchesQueueFilter(
        createSegment({ status: "pending", isHidden: true }),
        "untranslated",
      ),
    ).toBe(false);
    expect(
      segmentMatchesQueueFilter(createSegment({ status: "pending", isHidden: true }), "all"),
    ).toBe(true);
  });

  it("matches reviewed segments", () => {
    expect(segmentMatchesQueueFilter(createSegment({ status: "reviewed" }), "reviewed")).toBe(true);
  });

  it("matches issue segments separately from generic needs review", () => {
    const withIssue = createSegment({
      status: "needs_review",
      comments: [
        {
          id: "c-1",
          type: "issue",
          status: "open",
          text: "Wrong tone",
          createdAt: "2026-01-01T00:00:00.000Z",
          locale: "vi",
        },
      ],
    });

    expect(segmentMatchesQueueFilter(withIssue, "has_issues")).toBe(true);
    expect(segmentMatchesQueueFilter(withIssue, "needs_review")).toBe(false);
  });

  it("treats Crowdin unresolved issue status as open", () => {
    const withUnresolvedIssue = createSegment({
      status: "needs_review",
      comments: [
        {
          id: "c-1",
          type: "issue",
          status: "unresolved",
          text: "Wrong tone",
          createdAt: "2026-01-01T00:00:00.000Z",
          locale: "vi",
        },
      ],
    });

    expect(segmentMatchesQueueFilter(withUnresolvedIssue, "has_issues")).toBe(true);
    expect(segmentMatchesQueueFilter(withUnresolvedIssue, "needs_review")).toBe(false);
  });

  it("ignores resolved issue comments for the has issues filter", () => {
    const withResolvedIssue = createSegment({
      status: "needs_review",
      comments: [
        {
          id: "c-1",
          type: "issue",
          status: "resolved",
          text: "Fixed tone",
          createdAt: "2026-01-01T00:00:00.000Z",
          locale: "vi",
        },
      ],
    });

    expect(segmentMatchesQueueFilter(withResolvedIssue, "has_issues")).toBe(false);
    expect(segmentMatchesQueueFilter(withResolvedIssue, "needs_review")).toBe(true);
  });

  it("filters hidden segments", () => {
    const segments = [createSegment({ id: "a", isHidden: true }), createSegment({ id: "b" })];

    expect(filterCatQueueSegments(segments, "hidden").map((segment) => segment.id)).toEqual(["a"]);
  });

  it("matches hidden source strings", () => {
    expect(segmentMatchesQueueFilter(createSegment({ isHidden: true }), "hidden")).toBe(true);
    expect(segmentMatchesQueueFilter(createSegment(), "hidden")).toBe(false);
  });

  it("matches unsaved drafts from isDirty", () => {
    expect(
      segmentMatchesQueueFilterFromInput({ status: "needs_review", isDirty: true }, "unsaved"),
    ).toBe(true);
    expect(
      segmentMatchesQueueFilterFromInput({ status: "needs_review", isDirty: false }, "unsaved"),
    ).toBe(false);
  });
});

describe("resolveAvailableCatQueueFilters", () => {
  it("includes hidden for native and Crowdin projects", () => {
    expect(resolveAvailableCatQueueFilters(null)).toContain("hidden");
    expect(resolveAvailableCatQueueFilters("crowdin")).toContain("hidden");
    expect(resolveAvailableCatQueueFilters("phrase")).not.toContain("hidden");
    expect(resolveAvailableCatQueueFilters("lokalise")).not.toContain("hidden");
    expect(resolveAvailableCatQueueFilters("smartling")).not.toContain("hidden");
  });

  it("includes has issues for Crowdin projects", () => {
    expect(resolveAvailableCatQueueFilters("crowdin")).toContain("has_issues");
  });

  it("includes has issues for Phrase projects", () => {
    expect(resolveAvailableCatQueueFilters("phrase")).not.toContain("has_issues");
  });

  it("omits translation status filters for Phrase projects", () => {
    const filters = resolveAvailableCatQueueFilters("phrase");
    expect(filters).not.toContain("untranslated");
    expect(filters).not.toContain("needs_review");
    expect(filters).not.toContain("reviewed");
  });

  it("includes has issues for Smartling projects", () => {
    expect(resolveAvailableCatQueueFilters("smartling")).toContain("has_issues");
  });

  it("includes Crowdin extra filters only for Crowdin", () => {
    expect(resolveAvailableCatQueueFilters("crowdin")).toEqual(
      expect.arrayContaining(["unsaved", "qa_issues", "machine_translated", "with_comments"]),
    );
    expect(resolveAvailableCatQueueFilters("native")).not.toContain("qa_issues");
    expect(resolveAvailableCatQueueFilters("phrase")).not.toContain("machine_translated");
    expect(resolveAvailableCatQueueFilters(null)).toContain("unsaved");
    expect(resolveAvailableCatQueueFilters(null)).not.toContain("with_comments");
  });
});

describe("resolveAvailableCatQueueSorts", () => {
  it("offers untranslated first for native and Crowdin only", () => {
    expect(resolveAvailableCatQueueSorts("crowdin")).toContain("untranslated_first");
    expect(resolveAvailableCatQueueSorts("native")).toContain("untranslated_first");
    expect(resolveAvailableCatQueueSorts(null)).toContain("untranslated_first");
    expect(resolveAvailableCatQueueSorts("phrase")).toEqual(["file_order"]);
    expect(resolveAvailableCatQueueSorts("lokalise")).toEqual(["file_order"]);
    expect(resolveAvailableCatQueueSorts("smartling")).toEqual(["file_order"]);
  });
});

describe("resolveVisibleQueueSegments", () => {
  it("keeps server-filtered segments unchanged", () => {
    const segments = [
      createSegment({ id: "a", status: "pending" }),
      createSegment({ id: "b", status: "reviewed" }),
    ];

    expect(resolveVisibleQueueSegments(segments, "needs_review", true)).toEqual(segments);
  });

  it("applies local skipped filtering when the server does not own the filter", () => {
    const segments = [
      createSegment({ id: "a", status: "skipped" }),
      createSegment({ id: "b", status: "reviewed" }),
    ];

    expect(
      resolveVisibleQueueSegments(segments, "skipped", true).map((segment) => segment.id),
    ).toEqual(["a"]);
  });
});

describe("orderCatQueueSegmentsSkippedLast", () => {
  it("moves skipped segments to the end for untranslated first", () => {
    const ordered = orderCatQueueSegmentsSkippedLast(
      [
        { id: "a", status: "skipped" },
        { id: "b", status: "pending" },
        { id: "c", status: "reviewed" },
      ],
      "untranslated_first",
      (segment) => segment.status === "skipped",
    );

    expect(ordered.map((segment) => segment.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps file order when sort is file order", () => {
    const ordered = orderCatQueueSegmentsSkippedLast(
      [
        { id: "a", status: "skipped" },
        { id: "b", status: "pending" },
      ],
      "file_order",
      (segment) => segment.status === "skipped",
    );

    expect(ordered.map((segment) => segment.id)).toEqual(["a", "b"]);
  });
});

describe("findSegmentIdByKeyOrId", () => {
  const segments = [
    createSegment({ id: "seg-1", key: "alpha" }),
    createSegment({ id: "seg-2", key: "beta" }),
  ];

  it("returns null when the segment is not loaded yet", () => {
    expect(findSegmentIdByKeyOrId([], "beta")).toBeNull();
  });

  it("resolves by segment key", () => {
    expect(findSegmentIdByKeyOrId(segments, "beta")).toBe("seg-2");
  });
});

describe("resolveSelectedSegmentId", () => {
  const segments = [
    createSegment({ id: "seg-1", key: "alpha" }),
    createSegment({ id: "seg-2", key: "beta" }),
  ];

  it("resolves by segment key", () => {
    expect(resolveSelectedSegmentId(segments, "beta", "seg-1")).toBe("seg-2");
  });

  it("falls back when the preferred segment is missing", () => {
    expect(resolveSelectedSegmentId(segments, "missing", "seg-1")).toBe("seg-1");
  });
});
