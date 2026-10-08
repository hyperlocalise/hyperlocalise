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

import type { ProjectFileContentEditorQueueFile } from "@/api/routes/project/project.schema";
import { getIntlShape } from "@/lib/app-i18n/intl";

import { createCatWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-orchestrator";

import {
  projectFileCatToWorkspaceState,
  formatCheckForSegment,
  resolveCatFileIdentity,
  segmentStatusFromTarget,
} from "./project-file-content-editor-mapper";

const testIntl = getIntlShape("en");

function contentEditorFile(
  overrides: Partial<ProjectFileContentEditorQueueFile> = {},
): ProjectFileContentEditorQueueFile {
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
  it("omits Intercom callout fence segments from the queue", () => {
    const state = projectFileCatToWorkspaceState(
      contentEditorFile({
        sourcePath: "intercom/help/article.md",
        filename: "article.md",
        provider: null,
        segments: [
          {
            externalStringId: "fence",
            key: "md.Paragraph[4]/line[0]",
            sourceText: ':::callout backgroundColor="#feedaf80"\nborderColor="#fbc91633"',
            context: null,
            type: "text",
          },
          {
            externalStringId: "body",
            key: "md.Paragraph[4]/line[1]",
            sourceText: "For a public article to be enabled for Fin",
            context: null,
            type: "text",
          },
        ],
      }),
      "en",
      testIntl,
    );

    expect(state.queueSegments.map((segment) => segment.id)).toEqual(["body"]);
    expect(state.selectedSegmentId).toBe("body");
  });

  it("maps CAT content into workspace state without eager format checks", () => {
    const state = projectFileCatToWorkspaceState(contentEditorFile(), "en-GB", testIntl);

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
    const state = projectFileCatToWorkspaceState(
      contentEditorFile({ provider: null }),
      "en-US",
      testIntl,
    );

    expect(state.primaryActionLabel).toBe("Approve");
    expect(state.fileContext.providerKind).toBeNull();
    expect(state.fileContext.canAddComments).toBe(true);
  });

  it("maps native markdown documentView into file context", () => {
    const state = projectFileCatToWorkspaceState(
      contentEditorFile({
        provider: null,
        sourcePath: "docs/intro.md",
        filename: "intro.md",
        documentView: {
          externalStringId: "file_1",
          sourceAssetUrl: "/source.md",
          targetAssetUrl: "/target.md",
          imageVariantId: "variant_md",
        },
      }),
      "en-US",
      testIntl,
    );

    expect(state.fileContext.documentView).toEqual({
      externalStringId: "file_1",
      sourceAssetUrl: "/source.md",
      targetAssetUrl: "/target.md",
      imageVariantId: "variant_md",
    });
  });

  it("maps the project team name into file context", () => {
    const state = projectFileCatToWorkspaceState(
      contentEditorFile({
        provider: null,
        teamName: "Product",
        projectTeamSlug: "product",
        contributorTeams: [{ id: "team-product", name: "Product", slug: "product" }],
        canContributeTeamGlossary: true,
      }),
      "en-US",
      testIntl,
    );

    expect(state.fileContext.teamName).toBe("Product");
    expect(state.fileContext.projectTeamSlug).toBe("product");
    expect(state.fileContext.contributorTeams).toEqual([
      { id: "team-product", name: "Product", slug: "product" },
    ]);
    expect(state.fileContext.canContributeTeamGlossary).toBe(true);
  });

  it("does not allow adding concepts on external TMS projects", () => {
    const state = projectFileCatToWorkspaceState(
      contentEditorFile({
        canContributeTeamGlossary: true,
        teamName: "Product",
      }),
      "en-US",
      testIntl,
    );

    expect(state.fileContext.providerKind).toBe("crowdin");
    expect(state.fileContext.canContributeTeamGlossary).toBe(false);
  });

  it("uses Save to provider as the primary action label for TMS projects", () => {
    const state = projectFileCatToWorkspaceState(contentEditorFile(), "en-US", testIntl);

    expect(state.primaryActionLabel).toBe("Save to provider");
  });

  it("uses pagination offset for segment indices", () => {
    const state = projectFileCatToWorkspaceState(
      contentEditorFile({
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
      contentEditorFile({
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

  it("maps isHidden from CAT segments into queue state", () => {
    const state = projectFileCatToWorkspaceState(
      contentEditorFile({
        segments: [
          {
            externalStringId: "hidden-string",
            key: "legacy.banner",
            sourceText: "Retired banner",
            context: null,
            type: "text",
            isHidden: true,
          },
          {
            externalStringId: "visible-string",
            key: "hero.cta",
            sourceText: "Get started",
            context: null,
            type: "text",
            isHidden: false,
          },
        ],
      }),
      "en-US",
      testIntl,
    );

    expect(state.queueSegments[0]).toMatchObject({
      id: "hidden-string",
      isHidden: true,
    });
    expect(state.queueSegments[1]).not.toHaveProperty("isHidden");
  });

  it("maps isLocked from CAT segments into queue state", () => {
    const state = projectFileCatToWorkspaceState(
      contentEditorFile({
        segments: [
          {
            externalStringId: "locked-string",
            key: "checkout.title",
            sourceText: "Checkout",
            context: null,
            type: "text",
            isLocked: true,
          },
          {
            externalStringId: "unlocked-string",
            key: "hero.cta",
            sourceText: "Get started",
            context: null,
            type: "text",
            isLocked: false,
          },
        ],
      }),
      "en-US",
      testIntl,
    );

    expect(state.queueSegments[0]).toMatchObject({
      id: "locked-string",
      isLocked: true,
    });
    expect(state.queueSegments[1]).not.toHaveProperty("isLocked");
  });

  it("omits maxLength from workspace state when the CAT segment has a non-positive value", () => {
    const state = projectFileCatToWorkspaceState(
      contentEditorFile({
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

  it("prefers per-segment format over the top-level provider format for All Files", () => {
    const state = projectFileCatToWorkspaceState(
      contentEditorFile({
        sourcePath: "*",
        filename: "All Files",
        provider: {
          kind: "crowdin",
          resourceType: "file",
          externalProjectId: "crowdin-project",
          externalResourceId: "first-file",
          externalUrl: null,
          syncState: "ready",
          sourceLocale: "en-US",
          targetLocales: ["vi"],
          localeReadiness: {},
          revision: null,
          format: "android",
          lastSyncedAt: null,
        },
        segments: [
          {
            externalStringId: "json-string",
            key: "auth.title",
            sourceText: "Sign in",
            context: null,
            type: null,
            sourcePath: "locales/en.json",
            format: "json",
          },
          {
            externalStringId: "xml-string",
            key: "home.title",
            sourceText: "Home",
            context: null,
            type: null,
            sourcePath: "res/values/strings.xml",
            format: "android",
          },
        ],
      }),
      "en-US",
      testIntl,
    );

    expect(state.segmentIntelligence?.["json-string"]?.componentName).toBe("json");
    expect(state.segmentIntelligence?.["json-string"]?.filePath).toBe("locales/en.json");
    expect(state.segmentIntelligence?.["xml-string"]?.componentName).toBe("android");
    expect(state.segmentIntelligence?.["xml-string"]?.filePath).toBe("res/values/strings.xml");
  });
});

describe("ContentEditorWorkspaceOrchestrator lazy segment ingest", () => {
  it("merges lazy segment target without clobbering queue-only metadata", () => {
    const file = contentEditorFile({
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
    const store = createCatWorkspace(state);
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
    const store = createCatWorkspace(
      projectFileCatToWorkspaceState(contentEditorFile(), "en-US", testIntl),
    );

    store.applySegmentTarget("missing-segment", {
      text: "Missing",
      externalTranslationId: null,
      isApproved: false,
    });

    expect(store.getSegmentView("missing-segment")).toBeUndefined();
  });
});

describe("ContentEditorWorkspaceOrchestrator lazy comments ingest", () => {
  it("updates one segment's comments and issue tags while preserving other segments", () => {
    const store = createCatWorkspace(
      projectFileCatToWorkspaceState(contentEditorFile(), "en-US", testIntl),
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
    const store = createCatWorkspace(
      projectFileCatToWorkspaceState(contentEditorFile(), "en-US", testIntl),
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

  it("treats raw markdown links as the same tokens as source MD sentinels", () => {
    const md0 = "\u001eHLMDPH_8E6DFE8F53EA_0\u001f";
    const md1 = "\u001eHLMDPH_0EB5FD589564_1\u001f";
    const segment = {
      id: "seg-md",
      index: 1,
      key: "md.Paragraph[5]/line[0]",
      sourceText: `visit our ${md0}Help Center.${md1}`,
      targetText:
        "besuchen Sie unser [Hilfe-Center.](https://www.intercom.com/help/en/articles/56641-create-an-article)",
      sourceLocale: "en-US",
      targetLocale: "de-DE",
      status: "reviewed" as const,
    };

    const checks = formatCheckForSegment(segment, segment.targetText, testIntl);

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "format-parity",
          status: "pass",
          category: "placeholder",
        }),
      ]),
    );
    expect(checks.some((check) => check.id.startsWith("format-missing-token"))).toBe(false);
  });
});

describe("resolveCatFileIdentity", () => {
  it("prefers the explicit external resource id over cat file metadata", () => {
    expect(
      resolveCatFileIdentity({
        externalResourceId: "101",
        resourceType: "file",
        contentEditorFile: contentEditorFile(),
      }),
    ).toEqual({
      externalResourceId: "101",
      resourceType: "file",
    });
  });

  it("falls back to cat file provider metadata", () => {
    expect(
      resolveCatFileIdentity({
        contentEditorFile: contentEditorFile(),
      }),
    ).toEqual({
      externalResourceId: "crowdin-file",
      resourceType: "file",
    });
  });
});

describe("segmentStatusFromTarget", () => {
  const approved = { text: "Membre", isApproved: true } as Parameters<
    typeof segmentStatusFromTarget
  >[1];

  it("caps a grouped row at its least complete occurrence", () => {
    expect(segmentStatusFromTarget({ hasOpenIssues: false }, approved)).toBe("reviewed");
    expect(
      segmentStatusFromTarget({ hasOpenIssues: false, groupStatus: "needs_review" }, approved),
    ).toBe("needs_review");
    expect(
      segmentStatusFromTarget({ hasOpenIssues: false, groupStatus: "pending" }, approved),
    ).toBe("pending");
    expect(segmentStatusFromTarget({ hasOpenIssues: false, groupStatus: "reviewed" }, null)).toBe(
      "pending",
    );
  });
});
