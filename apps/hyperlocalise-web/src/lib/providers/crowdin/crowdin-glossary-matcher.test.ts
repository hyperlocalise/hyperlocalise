import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const glossaryConcordanceSearch = vi.fn();

vi.mock("./crowdin-api", () => ({
  CrowdinApiClient: vi.fn(
    function CrowdinApiClientMock(this: {
      glossaryConcordanceSearch: typeof glossaryConcordanceSearch;
    }) {
      this.glossaryConcordanceSearch = glossaryConcordanceSearch;
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

import { searchCrowdinGlossaryMatches } from "./crowdin-glossary-matcher";

describe("searchCrowdinGlossaryMatches", () => {
  beforeEach(() => {
    glossaryConcordanceSearch.mockReset();
  });

  it("skips concordance hits for glossaries that are not attached to the project", async () => {
    glossaryConcordanceSearch.mockResolvedValue([
      {
        glossary: { id: 99, name: "Unlinked glossary" },
        sourceTerms: [{ id: 1, languageId: "en", text: "Save" }],
        targetTerms: [{ id: 2, languageId: "fr", text: "Enregistrer" }],
      },
    ]);

    const matches = await searchCrowdinGlossaryMatches({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "crowdin",
      externalProjectId: "42",
      credential: {
        baseUrl: "https://api.crowdin.test/api/v2",
      } as never,
      secretMaterial: "token",
      glossaries: [
        {
          id: "glossary-local-1",
          name: "Product glossary",
          externalGlossaryId: "77",
          targetLocale: null,
          termCapabilities: {},
        },
      ],
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Save",
      limit: 5,
    });

    expect(matches).toEqual([]);
  });

  it("normalizes concordance hits for attached glossaries", async () => {
    glossaryConcordanceSearch.mockResolvedValue([
      {
        glossary: { id: 77, name: "Product glossary" },
        sourceTerms: [{ id: 1, languageId: "en", text: "Save", status: "preferred" }],
        targetTerms: [{ id: 2, languageId: "fr", text: "Enregistrer", status: "preferred" }],
      },
    ]);

    const matches = await searchCrowdinGlossaryMatches({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "crowdin",
      externalProjectId: "42",
      credential: {
        baseUrl: "https://api.crowdin.test/api/v2",
      } as never,
      secretMaterial: "token",
      glossaries: [
        {
          id: "glossary-local-1",
          name: "Product glossary",
          externalGlossaryId: "77",
          targetLocale: null,
          termCapabilities: {},
        },
      ],
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Save",
      limit: 5,
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      glossaryId: "glossary-local-1",
      glossaryName: "Product glossary",
      sourceTerm: "Save",
      targetTerm: "Enregistrer",
      targetLocale: "fr",
      providerKind: "crowdin",
      externalResourceId: "77",
      matchSource: "live_provider",
    });
  });
});
