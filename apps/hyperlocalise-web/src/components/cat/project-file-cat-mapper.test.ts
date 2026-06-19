import { describe, expect, it } from "vite-plus/test";

import type { ProjectFileCatResponse } from "@/api/routes/project/project.schema";
import { getIntlShape } from "@/lib/app-i18n/intl";

import { projectFileCatToWorkspaceState } from "./project-file-cat-mapper";

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
    expect(state.queueSummary).toEqual({ total: 2, reviewed: 1 });
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

  it("uses pagination offset for segment indices and page-scoped queue totals", () => {
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
    expect(state.queueSummary).toEqual({ total: 2, reviewed: 1 });
  });
});
