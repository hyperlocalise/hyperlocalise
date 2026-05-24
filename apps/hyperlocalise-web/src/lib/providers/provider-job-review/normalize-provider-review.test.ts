import { describe, expect, it } from "vite-plus/test";

import {
  buildProviderReviewReport,
  mergeProviderReviewReports,
  normalizeProviderReviewThread,
} from "./normalize-provider-review";
import type { ProviderReviewThread } from "./types";

function sampleThread(overrides: Partial<ProviderReviewThread> = {}): ProviderReviewThread {
  return {
    threadId: "crowdin:1:9:issue:42",
    kind: "issue",
    state: "open",
    subject: "  Fix translation  ",
    issueType: "translation_mistake",
    item: {
      externalStringId: "100",
      key: "welcome.title",
      locale: "de",
    },
    locale: "de",
    comments: [
      {
        externalCommentId: "42",
        body: "  Please review  ",
        author: {
          externalUserId: "7",
          username: " reviewer ",
          displayName: null,
        },
        createdAt: "2026-05-01T10:00:00Z",
        updatedAt: null,
      },
    ],
    author: {
      externalUserId: "7",
      username: "reviewer",
      displayName: "Reviewer",
    },
    resolver: null,
    createdAt: "2026-05-01T10:00:00Z",
    updatedAt: "2026-05-01T10:00:00Z",
    resolvedAt: null,
    providerContext: {
      externalProjectId: "1",
      externalJobId: "9",
      externalThreadId: "42",
      externalCommentId: "42",
      providerUrl: " https://crowdin.com/project/demo/comments/42 ",
    },
    ...overrides,
  };
}

describe("normalizeProviderReviewThread", () => {
  it("trims text fields and preserves nullable metadata", () => {
    const normalized = normalizeProviderReviewThread(sampleThread());

    expect(normalized.subject).toBe("Fix translation");
    expect(normalized.comments[0]?.body).toBe("Please review");
    expect(normalized.comments[0]?.author?.username).toBe("reviewer");
    expect(normalized.providerContext.providerUrl).toBe(
      "https://crowdin.com/project/demo/comments/42",
    );
  });

  it("handles missing optional author and resolver fields", () => {
    const normalized = normalizeProviderReviewThread(
      sampleThread({
        author: undefined,
        resolver: undefined,
        issueType: undefined,
        item: undefined,
        locale: undefined,
      }),
    );

    expect(normalized.author).toBeNull();
    expect(normalized.resolver).toBeNull();
    expect(normalized.issueType).toBeNull();
    expect(normalized.item).toBeUndefined();
    expect(normalized.locale).toBeNull();
  });
});

describe("buildProviderReviewReport", () => {
  it("builds summary counts by kind and state", () => {
    const report = buildProviderReviewReport([
      sampleThread({ state: "open", kind: "issue" }),
      sampleThread({
        threadId: "crowdin:1:9:comment:99",
        kind: "comment",
        state: "resolved",
        providerContext: {
          externalProjectId: "1",
          externalJobId: "9",
          externalThreadId: "99",
        },
      }),
    ]);

    expect(report.summary).toEqual({
      total: 2,
      open: 1,
      resolved: 1,
      byKind: {
        issue: 1,
        comment: 1,
      },
    });
  });
});

describe("mergeProviderReviewReports", () => {
  it("replaces threads with the same id and sorts by updated time", () => {
    const previous = buildProviderReviewReport([
      sampleThread({
        updatedAt: "2026-05-01T09:00:00Z",
        state: "open",
      }),
    ]);

    const incoming = buildProviderReviewReport([
      sampleThread({
        state: "resolved",
        resolvedAt: "2026-05-02T12:00:00Z",
        updatedAt: "2026-05-02T12:00:00Z",
      }),
      sampleThread({
        threadId: "crowdin:1:9:task_comment:5",
        kind: "task_comment",
        state: "open",
        updatedAt: "2026-05-03T08:00:00Z",
        providerContext: {
          externalProjectId: "1",
          externalJobId: "9",
          externalThreadId: "5",
        },
      }),
    ]);

    const merged = mergeProviderReviewReports(previous, incoming);

    expect(merged.threads).toHaveLength(2);
    expect(merged.threads[0]?.threadId).toBe("crowdin:1:9:task_comment:5");
    expect(merged.threads[1]?.state).toBe("resolved");
    expect(merged.summary.resolved).toBe(1);
  });

  it("returns incoming report when previous is empty", () => {
    const incoming = buildProviderReviewReport([sampleThread()]);
    const merged = mergeProviderReviewReports(null, incoming);
    expect(merged).toEqual(incoming);
  });
});
