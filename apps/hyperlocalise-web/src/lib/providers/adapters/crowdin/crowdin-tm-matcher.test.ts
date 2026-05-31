import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const concordanceSearch = vi.fn();

vi.mock("./crowdin-api", () => ({
  CrowdinApiClient: vi.fn(
    function CrowdinApiClientMock(this: { concordanceSearch: typeof concordanceSearch }) {
      this.concordanceSearch = concordanceSearch;
    },
  ),
  CrowdinApiError: class CrowdinApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
      this.name = "CrowdinApiError";
    }
  },
}));

import { searchCrowdinTranslationMemoryMatches } from "./crowdin-tm-matcher";

describe("searchCrowdinTranslationMemoryMatches", () => {
  beforeEach(() => {
    concordanceSearch.mockReset();
  });

  it("filters concordance hits to the attached memory when externalMemoryId is set", async () => {
    concordanceSearch.mockResolvedValue([
      {
        tm: { id: 10, name: "Product TM" },
        recordId: 501,
        source: "Save file",
        target: "Enregistrer le fichier",
        relevant: 90,
        substituted: "Enregistrer le fichier",
        updatedAt: "2026-05-23T00:00:00Z",
      },
      {
        tm: { id: 11, name: "Other TM" },
        recordId: 502,
        source: "Save file",
        target: "Guardar archivo",
        relevant: 80,
        substituted: "Guardar archivo",
        updatedAt: "2026-05-23T00:00:00Z",
      },
    ]);

    const matches = await searchCrowdinTranslationMemoryMatches({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "crowdin",
      externalProjectId: "42",
      credential: {
        baseUrl: "https://api.crowdin.test/api/v2",
      } as never,
      secretMaterial: "token",
      memory: {
        id: "memory-local-1",
        name: "Product TM",
        externalMemoryId: "10",
        capabilityMode: "live_search",
      },
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Save file",
      limit: 5,
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      memoryId: "memory-local-1",
      memoryName: "Product TM",
      sourceText: "Save file",
      targetText: "Enregistrer le fichier",
      externalResourceId: "10",
      matchSource: "live_provider",
    });
  });
});
