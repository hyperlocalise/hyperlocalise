import { describe, expect, it } from "vite-plus/test";

import type { ProjectFileCatQueueFile } from "@/api/routes/project/project.schema";
import { getIntlShape } from "@/lib/app-i18n/intl";
import {
  projectFileCatToWorkspaceState,
  requireProviderExternalResourceId,
} from "@/components/cat/project-file/project-file-cat-mapper";

const testIntl = getIntlShape("en");

function catFile(): ProjectFileCatQueueFile {
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
  };
}

describe("projectFileCatToWorkspaceState", () => {
  it("maps live Crowdin CAT queue content into the next-gen CAT workspace shape", () => {
    const state = projectFileCatToWorkspaceState(catFile(), "en-US", testIntl);

    expect(state.selectedSegmentId).toBe("approved-string");
    expect(state.fileContext).toMatchObject({
      sourceLocale: "en-US",
      targetLocale: "vi",
      sourcePath: "en-US.json",
    });
    expect(state.queueSegments[0]).toMatchObject({
      id: "approved-string",
      key: "auth.signIn.title",
    });
    expect(state.queueSegments[1]).toMatchObject({
      id: "issue-string",
    });
    expect(state.segmentIntelligence?.["issue-string"]?.segmentType).toBe("icu");
    expect(state.segmentFormatChecks).toEqual({});
    expect(state.formatChecks).toEqual([]);
    expect(state.intelligence.filePath).toBe("en-US.json");
    expect(state.segmentIntelligence?.["approved-string"]).toMatchObject({
      productMeaning: "Heading on the sign-in screen",
      locationBreadcrumb: "auth.signIn.title",
      filePath: "en-US.json",
    });
    expect(state.segmentIntelligence?.["issue-string"]?.productMeaning).toBeUndefined();
    expect(state.breadcrumbs).toEqual(["crowdin", "en-US.json", "vi"]);
    expect(state.canEditTranslations).toBe(true);
  });

  it("maps canEditTranslations from the CAT file payload", () => {
    const readOnlyState = projectFileCatToWorkspaceState(
      {
        ...catFile(),
        canEditTranslations: false,
      },
      "en-US",
      testIntl,
    );

    expect(readOnlyState.fileContext.canEditTranslations).toBe(false);
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
