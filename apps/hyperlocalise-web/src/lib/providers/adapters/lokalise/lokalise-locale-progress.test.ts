import { describe, expect, it, vi } from "vite-plus/test";

import {
  loadLokaliseProjectLocaleReadiness,
  mapLokaliseLocaleProgressToReadiness,
} from "./lokalise-locale-progress";

describe("mapLokaliseLocaleProgressToReadiness", () => {
  it("maps phrase counts to crowdin-compatible readiness fields", () => {
    expect(
      mapLokaliseLocaleProgressToReadiness({
        locale: "fr",
        counts: { total: 4, translated: 3, approved: 2 },
      }),
    ).toEqual({
      translationProgress: 75,
      approvalProgress: 50,
      words: { total: 4, translated: 3, approved: 2 },
      phrases: { total: 4, translated: 3, approved: 2 },
    });
  });
});

describe("loadLokaliseProjectLocaleReadiness", () => {
  it("aggregates key translation states per locale", async () => {
    const client = {
      listKeys: vi.fn(async () => [
        {
          keyId: 1,
          keyName: { web: "a", ios: "", android: "", other: "" },
          filenames: { web: "", ios: "", android: "", other: "" },
          description: null,
          context: null,
          platforms: ["web"],
          tags: [],
          isPlural: false,
          isHidden: false,
          isArchived: false,
          createdAt: null,
          modifiedAt: null,
          translationsModifiedAt: null,
          translations: [
            {
              translationId: 1,
              keyId: 1,
              languageIso: "fr",
              translation: "A",
              modifiedAt: null,
              modifiedAtTimestamp: null,
              isReviewed: true,
              isUnverified: false,
            },
          ],
        },
        {
          keyId: 2,
          keyName: { web: "b", ios: "", android: "", other: "" },
          filenames: { web: "", ios: "", android: "", other: "" },
          description: null,
          context: null,
          platforms: ["web"],
          tags: [],
          isPlural: false,
          isHidden: false,
          isArchived: false,
          createdAt: null,
          modifiedAt: null,
          translationsModifiedAt: null,
          translations: [],
        },
      ]),
      listProjectLanguages: vi.fn(async () => [
        { langId: 641, langIso: "fr", langName: "French", isRtl: false },
      ]),
    };

    const readiness = await loadLokaliseProjectLocaleReadiness({
      client: client as never,
      projectId: "proj.123",
      languageId: "fr",
    });

    expect(readiness).toEqual({
      translationProgress: 50,
      approvalProgress: 50,
      words: { total: 2, translated: 1, approved: 1 },
      phrases: { total: 2, translated: 1, approved: 1 },
    });
  });
});
