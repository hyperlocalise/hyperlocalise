import { describe, expect, it } from "vite-plus/test";

import {
  filterCatQueueSegments,
  findSegmentIdByKeyOrId,
  resolveAvailableCatQueueFilters,
  resolveSelectedSegmentId,
  resolveVisibleQueueSegments,
  segmentMatchesQueueFilter,
} from "./cat-queue-filter";
import type { CatSegment } from "./types";

function createSegment(overrides: Partial<CatSegment> = {}): CatSegment {
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

  it("filters segment lists", () => {
    const segments = [
      createSegment({ id: "a", status: "pending" }),
      createSegment({ id: "b", status: "reviewed" }),
      createSegment({ id: "c", status: "skipped" }),
    ];

    expect(filterCatQueueSegments(segments, "reviewed").map((segment) => segment.id)).toEqual([
      "b",
    ]);
  });
});

describe("resolveAvailableCatQueueFilters", () => {
  it("omits has issues for native projects", () => {
    expect(resolveAvailableCatQueueFilters(null)).not.toContain("has_issues");
    expect(resolveAvailableCatQueueFilters(undefined)).not.toContain("has_issues");
  });

  it("includes has issues for Crowdin projects", () => {
    expect(resolveAvailableCatQueueFilters("crowdin")).toContain("has_issues");
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
