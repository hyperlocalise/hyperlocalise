import { describe, expect, it } from "vite-plus/test";

import type { ProjectFileCatQueueFile } from "@/api/routes/project/project.schema";
import { getIntlShape } from "@/lib/app-i18n/intl";

import { createCatWorkspaceStore } from "@/components/cat/workspace/store/cat-workspace-store";

import {
  projectFileCatToWorkspaceState,
  formatCheckForSegment,
  resolveCatFileIdentity,
} from "./project-file-cat-mapper";

const testIntl = getIntlShape("en");

function catFile(overrides: Partial<ProjectFileCatQueueFile> = {}): ProjectFileCatQueueFile {
  return {
    sourcePath: "en-US.json",
    filename: "en-US.json",
    provider: {
      kind: "crowdin",
      resourceType: "file",
      externalProjectId: "crowdin-project",
      externalResourceId: "crowdin-file",
      externalUrl: null,
      syncState: "ready",
      sourceLocale: "en-US",
      targetLocales: ["vi"],
      localeReadiness: {},
      revision: null,
      format: "react_intl",
      lastSyncedAt: null,
    },
    targetLocale: "vi",
    canEditTranslations: true,
    truncated: false,
    segments: [
      {
        externalStringId: "approved-string",
        key: "auth.signIn.title",
        sourceText: "Sign in to your workspace",
        context: "Heading on the sign-in screen",
        type: "text",
      },
      {
        externalStringId: "issue-string",
        key: "dashboard.pendingReviews",
        sourceText: "{count, plural, one {# review pending} other {# reviews pending}}",
        context: null,
        type: "icu",
      },
    ],
    ...overrides,
  };
}

describe("projectFileCatToWorkspaceState", () => {
  it("maps CAT content into workspace state without eager format checks", () => {
    const state = projectFileCatToWorkspaceState(catFile(), "en-GB", testIntl);

    expect(state.selectedSegmentId).toBe("approved-string");
    expect(state.formatChecks).toEqual([]);
    expect(state.segmentFormatChecks).toEqual({});
    expect(state.fileContext.sourceLocale).toBe("en-GB");
    expect(state.fileContext.targetLocale).toBe("vi");
    expect(state.queueSegments[1]).toMatchObject({
      id: "issue-string",
    });
    expect(state.segmentIntelligence?.["issue-string"]?.segmentType).toBe("icu");
  });

  it("uses Approve as the primary action label for native projects", () => {
    const state = projectFileCatToWorkspaceState(catFile({ provider: null }), "en-US", testIntl);

    expect(state.primaryActionLabel).toBe("Approve");
    expect(state.fileContext.providerKind).toBeNull();
    expect(state.fileContext.canAddComments).toBe(true);
  });

  it("uses Save to provider as the primary action label for TMS projects", () => {
    const state = projectFileCatToWorkspaceState(catFile(), "en-US", testIntl);

    expect(state.primaryActionLabel).toBe("Save to provider");
  });

  it("uses pagination offset for segment indices", () => {
    const state = projectFileCatToWorkspaceState(
      catFile({
        pagination: {
          offset: 50,
          limit: 50,
          returnedCount: 2,
          totalCount: 120,
          hasMore: true,
        },
      }),
      "en-US",
      testIntl,
    );

    expect(state.queueSegments[0]?.index).toBe(51);
  });

  it("maps maxLength from CAT segments into workspace state", () => {
    const state = projectFileCatToWorkspaceState(
      catFile({
        segments: [
          {
            externalStringId: "limited-string",
            key: "hero.cta",
            sourceText: "Get started",
            context: null,
            type: "text",
            maxLength: 24,
          },
        ],
      }),
      "en-US",
      testIntl,
    );

    expect(state.segmentIntelligence?.["limited-string"]?.maxLength).toBe(24);
  });

  it("omits maxLength from workspace state when the CAT segment has a non-positive value", () => {
    const state = projectFileCatToWorkspaceState(
      catFile({
        segments: [
          {
            externalStringId: "limited-string",
            key: "hero.cta",
            sourceText: "Get started",
            context: null,
            type: "text",
            maxLength: 0,
          },
        ],
      }),
      "en-US",
      testIntl,
    );

    expect(state.segmentIntelligence?.["limited-string"]?.maxLength).toBeUndefined();
  });
});

describe("CatWorkspaceStore lazy segment ingest", () => {
  it("merges lazy segment target without clobbering queue-only metadata", () => {
    const file = catFile({
      pagination: {
        offset: 50,
        limit: 25,
        returnedCount: 2,
        totalCount: 75,
        hasMore: true,
      },
      segments: [
        {
          externalStringId: "segment-with-detail",
          key: "auth.signIn.title",
          sourceText: "Sign in to your workspace",
          context: null,
          type: "text",
        },
        {
          externalStringId: "untouched-segment",
          key: "dashboard.title",
          sourceText: "Dashboard",
          context: null,
          type: "text",
        },
      ],
    });
    const state = projectFileCatToWorkspaceState(file, "en-US", testIntl);
    const store = createCatWorkspaceStore(state);
    const untouchedSegment = store.getQueuePanelSegments("all", false)[1];

    store.applySegmentTarget("segment-with-detail", {
      text: "Dang nhap vao khong gian lam viec",
      externalTranslationId: "translation-1",
      isApproved: false,
    });

    expect(store.getSegmentView("segment-with-detail")).toMatchObject({
      id: "segment-with-detail",
      index: 51,
      targetText: "Dang nhap vao khong gian lam viec",
      status: "needs_review",
    });
    expect(store.segmentIntelligence?.["segment-with-detail"]?.segmentType).toBe("text");
    expect(store.getQueuePanelSegments("all", false)[1]).toEqual(untouchedSegment);
  });

  it("ignores target updates for segments that are not in the queue", () => {
    const store = createCatWorkspaceStore(
      projectFileCatToWorkspaceState(catFile(), "en-US", testIntl),
    );

    store.applySegmentTarget("missing-segment", {
      text: "Missing",
      externalTranslationId: null,
      isApproved: false,
    });

    expect(store.getSegmentView("missing-segment")).toBeUndefined();
  });
});

describe("CatWorkspaceStore lazy comments ingest", () => {
  it("updates one segment's comments and issue tags while preserving other segments", () => {
    const store = createCatWorkspaceStore(
      projectFileCatToWorkspaceState(catFile(), "en-US", testIntl),
    );
    const untouchedSegment = store.getQueuePanelSegments("all", false)[0];

    store.applySegmentComments("issue-string", [
      {
        externalCommentId: "comment-1",
        type: "comment",
        status: null,
        text: "Please keep the concise tone.",
        createdAt: "2026-06-11T00:00:00.000Z",
        locale: "vi",
      },
      {
        externalCommentId: "issue-resolved",
        type: "issue",
        status: "resolved",
        text: "Resolved product context issue.",
        createdAt: "2026-06-12T00:00:00.000Z",
        locale: "vi",
        author: "Reviewer",
      },
    ]);

    expect(store.getQueuePanelSegments("all", false)[0]).toEqual(untouchedSegment);
    expect(store.getSegmentView("issue-string")).toMatchObject({
      id: "issue-string",
      hasOpenIssues: false,
      tags: ["icu", "2 comments"],
      comments: [
        {
          id: "comment-1",
          type: "comment",
          status: null,
          text: "Please keep the concise tone.",
          author: null,
        },
        {
          id: "issue-resolved",
          type: "issue",
          status: "resolved",
          text: "Resolved product context issue.",
          author: "Reviewer",
        },
      ],
    });
  });

  it("ignores comments for segments that are not in the queue", () => {
    const store = createCatWorkspaceStore(
      projectFileCatToWorkspaceState(catFile(), "en-US", testIntl),
    );

    store.applySegmentComments("missing-segment", []);

    expect(store.segmentComments.has("missing-segment")).toBe(false);
  });
});

describe("formatCheckForSegment", () => {
  it("includes glossary compliance checks when glossary terms are provided", () => {
    const segment = {
      id: "seg-1",
      index: 1,
      key: "dashboard.title",
      sourceText: "Open Dashboard settings",
      targetText: "Mở cài đặt",
      sourceLocale: "en-US",
      targetLocale: "vi",
      status: "needs_review" as const,
    };

    const checks = formatCheckForSegment(segment, segment.targetText, testIntl, [
      {
        id: "term-dashboard",
        source: "Dashboard",
        target: "Bảng điều khiển",
        approved: true,
        forbidden: false,
      },
    ]);

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "glossary-missing-term-dashboard",
          status: "warn",
          category: "glossary",
        }),
      ]),
    );
  });
});

describe("resolveCatFileIdentity", () => {
  it("prefers the explicit external resource id over cat file metadata", () => {
    expect(
      resolveCatFileIdentity({
        externalResourceId: "101",
        resourceType: "file",
        catFile: catFile(),
      }),
    ).toEqual({
      externalResourceId: "101",
      resourceType: "file",
    });
  });

  it("falls back to cat file provider metadata", () => {
    expect(
      resolveCatFileIdentity({
        catFile: catFile(),
      }),
    ).toEqual({
      externalResourceId: "crowdin-file",
      resourceType: "file",
    });
  });
});
