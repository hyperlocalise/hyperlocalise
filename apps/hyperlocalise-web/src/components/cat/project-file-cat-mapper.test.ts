import { describe, expect, it } from "vite-plus/test";

import type { ProjectFileCatResponse } from "@/api/routes/project/project.schema";
import { getIntlShape } from "@/lib/app-i18n/intl";

import { projectFileCatToWorkspaceState, formatCheckForSegment } from "./project-file-cat-mapper";

const testIntl = getIntlShape("en");

function catFile(
  overrides: Partial<ProjectFileCatResponse["catFile"]> = {},
): ProjectFileCatResponse["catFile"] {
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
        target: {
          text: "Dang nhap vao khong gian lam viec",
          externalTranslationId: "translation-1",
          isApproved: true,
        },
        comments: [],
      },
      {
        externalStringId: "issue-string",
        key: "dashboard.pendingReviews",
        sourceText: "{count, plural, one {# review pending} other {# reviews pending}}",
        context: null,
        type: "icu",
        target: null,
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
            target: {
              text: "Bang dieu khien",
              externalTranslationId: "translation-2",
              isApproved: false,
            },
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
      status: "needs_review",
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
            target: null,
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
            target: null,
            comments: [],
          },
        ],
      }),
      testIntl,
    );

    expect(state.segments[0]?.maxLength).toBeUndefined();
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
