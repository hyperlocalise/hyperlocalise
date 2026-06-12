import { describe, expect, it } from "vite-plus/test";

import type { ProjectFileCatResponse } from "@/api/routes/project/project.schema";
import {
  projectFileCatToWorkspaceState,
  requireProviderExternalResourceId,
} from "./tms-job-cat-workspace";

function catFile(): ProjectFileCatResponse["catFile"] {
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
  };
}

describe("projectFileCatToWorkspaceState", () => {
  it("maps live Crowdin CAT content into the next-gen CAT workspace shape", () => {
    const state = projectFileCatToWorkspaceState(catFile());

    expect(state.selectedSegmentId).toBe("approved-string");
    expect(state.queueSummary).toEqual({ total: 2, reviewed: 1 });
    expect(state.segments[0]).toMatchObject({
      id: "approved-string",
      key: "auth.signIn.title",
      sourceLocale: "en-US",
      targetLocale: "vi",
      targetText: "Dang nhap vao khong gian lam viec",
      contextLabel: "Heading on the sign-in screen",
      status: "reviewed",
    });
    expect(state.segments[1]).toMatchObject({
      id: "issue-string",
      status: "needs_review",
      tags: ["icu", "1 comment", "1 issue"],
    });
    expect(state.segmentFormatChecks?.["issue-string"]).toContainEqual(
      expect.objectContaining({
        label: "ICU structure",
        status: "fail",
      }),
    );
    expect(state.intelligence.filePath).toBe("en-US.json");
    expect(state.segmentIntelligence?.["approved-string"]).toMatchObject({
      productMeaning: "Heading on the sign-in screen",
      locationBreadcrumb: "auth.signIn.title",
      filePath: "en-US.json",
    });
    expect(state.segmentIntelligence?.["issue-string"]?.productMeaning).toContain(
      "1 Crowdin comment is attached",
    );
    expect(state.breadcrumbs).toEqual(["crowdin", "en-US.json", "vi"]);
    expect(state.canEditTranslations).toBe(true);
  });

  it("maps canEditTranslations from the CAT file payload", () => {
    const readOnlyState = projectFileCatToWorkspaceState({
      ...catFile(),
      canEditTranslations: false,
    });

    expect(readOnlyState.canEditTranslations).toBe(false);
  });
});

describe("requireProviderExternalResourceId", () => {
  it("throws a clear error when a CAT save has no provider file identifier", () => {
    const file = { ...catFile(), provider: null };

    expect(() => requireProviderExternalResourceId(file)).toThrow(
      "Cannot save translation because the provider file identifier is missing.",
    );
  });
});
