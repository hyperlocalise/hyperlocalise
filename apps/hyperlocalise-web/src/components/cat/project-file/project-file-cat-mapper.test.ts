import { describe, expect, it } from "vite-plus/test";

import type { ProjectFileCatQueueFile } from "@/api/routes/project/project.schema";
import { getIntlShape } from "@/lib/app-i18n/intl";

import {
  applyCatSegmentCommentsToWorkspaceState,
  applyCatSegmentTargetToWorkspaceState,
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
        comments: [],
      },
      {
        externalStringId: "issue-string",
        key: "dashboard.pendingReviews",
        sourceText: "{count, plural, one {# review pending} other {# reviews pending}}",
        context: null,
        type: "icu",
        comments: [
          {
            externalCommentId: "comment-1",
            type: "issue",
            status: "unresolved",
            text: "Needs product context",
            createdAt: "2026-06-10T00:00:00.000Z",
            locale: "vi",
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("projectFileCatToWorkspaceState", () => {
  it("maps CAT content into workspace state without eager format checks", () => {
    const state = projectFileCatToWorkspaceState(catFile(), testIntl);

    expect(state.selectedSegmentId).toBe("approved-string");
    expect(state.formatChecks).toEqual([]);
    expect(state.segmentFormatChecks).toEqual({});
    expect(state.segments[1]).toMatchObject({
      id: "issue-string",
      status: "needs_review",
      tags: ["icu", "1 comment", "1 issue"],
      comments: [
        {
          id: "comment-1",
          type: "issue",
          status: "unresolved",
          text: "Needs product context",
          createdAt: "2026-06-10T00:00:00.000Z",
          locale: "vi",
          author: null,
        },
      ],
    });
  });

  it("ignores resolved issues when computing segment status and tags", () => {
    const state = projectFileCatToWorkspaceState(
      catFile({
        segments: [
          {
            externalStringId: "resolved-issue-string",
            key: "dashboard.title",
            sourceText: "Dashboard",
            context: null,
            type: "text",
            comments: [
              {
                externalCommentId: "comment-resolved",
                type: "issue",
                status: "resolved",
                text: "Fixed wording",
                createdAt: "2026-06-10T00:00:00.000Z",
                locale: "vi",
              },
            ],
          },
        ],
      }),
      testIntl,
    );

    expect(state.segments[0]).toMatchObject({
      id: "resolved-issue-string",
      status: "pending",
      hasOpenIssues: false,
      tags: ["text", "1 comment"],
    });
  });

  it("uses Approve as the primary action label for native projects", () => {
    const state = projectFileCatToWorkspaceState(catFile({ provider: null }), testIntl);

    expect(state.primaryActionLabel).toBe("Approve");
    expect(state.providerKind).toBeNull();
    expect(state.canAddComments).toBe(true);
  });

  it("uses Save to provider as the primary action label for TMS projects", () => {
    const state = projectFileCatToWorkspaceState(catFile(), testIntl);

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
      testIntl,
    );

    expect(state.segments[0]?.index).toBe(51);
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
            comments: [],
          },
        ],
      }),
      testIntl,
    );

    expect(state.segments[0]?.maxLength).toBe(24);
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
            comments: [],
          },
        ],
      }),
      testIntl,
    );

    expect(state.segments[0]?.maxLength).toBeUndefined();
  });
});

describe("applyCatSegmentTargetToWorkspaceState", () => {
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
          comments: [],
          commentCount: 3,
          unresolvedIssueCount: 1,
        },
        {
          externalStringId: "untouched-segment",
          key: "dashboard.title",
          sourceText: "Dashboard",
          context: null,
          type: "text",
          comments: [],
        },
      ],
    });
    const state = projectFileCatToWorkspaceState(file, testIntl);
    const untouchedSegment = state.segments[1];

    const nextState = applyCatSegmentTargetToWorkspaceState(
      state,
      "segment-with-detail",
      {
        text: "Dang nhap vao khong gian lam viec",
        externalTranslationId: "translation-1",
        isApproved: false,
      },
      testIntl,
    );

    expect(nextState.segments[0]).toMatchObject({
      id: "segment-with-detail",
      index: 51,
      targetText: "Dang nhap vao khong gian lam viec",
      tags: ["text", "3 comments", "1 issue"],
      hasOpenIssues: true,
      status: "needs_review",
    });
    expect(nextState.segments[1]).toBe(untouchedSegment);
  });

  it("returns the existing state when target does not match a loaded segment", () => {
    const file = catFile();
    const state = projectFileCatToWorkspaceState(file, testIntl);

    const nextState = applyCatSegmentTargetToWorkspaceState(
      state,
      "missing-segment",
      {
        text: "Missing",
        externalTranslationId: null,
        isApproved: false,
      },
      testIntl,
    );

    expect(nextState).toBe(state);
  });
});

describe("applyCatSegmentCommentsToWorkspaceState", () => {
  it("updates one segment's comments and issue tags while preserving other segments", () => {
    const state = projectFileCatToWorkspaceState(catFile(), testIntl);
    const untouchedSegment = state.segments[0];

    const nextState = applyCatSegmentCommentsToWorkspaceState(state, "issue-string", [
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

    expect(nextState.segments[0]).toBe(untouchedSegment);
    expect(nextState.segments[1]).toMatchObject({
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

  it("returns the existing state when comments target an unknown segment", () => {
    const state = projectFileCatToWorkspaceState(catFile(), testIntl);

    const nextState = applyCatSegmentCommentsToWorkspaceState(state, "missing-segment", []);

    expect(nextState).toBe(state);
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
