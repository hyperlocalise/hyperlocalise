import { describe, expect, it, vi } from "vite-plus/test";

import { CrowdinApiClient } from "./crowdin-api";
import { searchCrowdinCatConcordance } from "./crowdin-cat-concordance";

describe("searchCrowdinCatConcordance", () => {
  it("maps Crowdin glossary and TM concordance results without attached resource filtering", async () => {
    const glossaryConcordanceSearch = vi.fn().mockResolvedValue([
      {
        glossary: { id: 7, name: "Product terms" },
        concept: {
          id: 1,
          subject: "",
          definition: "",
          translatable: true,
          note: "",
          url: "",
          figure: "",
        },
        sourceTerms: [{ id: 11, languageId: "en", text: "workspace", status: "preferred" }],
        targetTerms: [{ id: 12, languageId: "fr", text: "espace de travail", status: "preferred" }],
      },
    ]);
    const concordanceSearch = vi.fn().mockResolvedValue([
      {
        tm: { id: 3, name: "Website TM" },
        recordId: 99,
        source: "Sign in to your workspace",
        target: "Connectez-vous a votre espace de travail",
        relevant: 92,
      },
    ]);

    const client = {
      glossaryConcordanceSearch,
      concordanceSearch,
    } as unknown as CrowdinApiClient;

    const result = await searchCrowdinCatConcordance({
      client,
      externalProjectId: "42",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Sign in to your workspace",
    });

    expect(glossaryConcordanceSearch).toHaveBeenCalledWith(42, {
      sourceLanguageId: "en",
      targetLanguageId: "fr",
      expressions: ["Sign in to your workspace"],
    });
    expect(result.glossaryTerms).toHaveLength(1);
    expect(result.glossaryTerms[0]).toMatchObject({
      sourceTerm: "workspace",
      targetTerm: "espace de travail",
      glossaryName: "Product terms",
      matchSource: "live_provider",
    });
    expect(result.translationMemoryMatches).toHaveLength(1);
    expect(result.translationMemoryMatches[0]).toMatchObject({
      sourceText: "Sign in to your workspace",
      targetText: "Connectez-vous a votre espace de travail",
      matchScore: 92,
      memoryName: "Website TM",
    });
  });

  it("maps forbidden Crowdin glossary term status into normalized term flags", async () => {
    const client = {
      glossaryConcordanceSearch: vi.fn().mockResolvedValue([
        {
          glossary: { id: 7, name: "Product terms" },
          concept: {
            id: 1,
            subject: "",
            definition: "",
            translatable: true,
            note: "",
            url: "",
            figure: "",
          },
          sourceTerms: [{ id: 11, languageId: "en", text: "workspace", status: "preferred" }],
          targetTerms: [{ id: 12, languageId: "fr", text: "espace", status: "forbidden" }],
        },
      ]),
      concordanceSearch: vi.fn().mockResolvedValue([]),
    } as unknown as CrowdinApiClient;

    const result = await searchCrowdinCatConcordance({
      client,
      externalProjectId: "42",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "workspace",
    });

    expect(result.glossaryTerms[0]?.termStatus).toEqual({
      forbidden: true,
      preferred: false,
    });
  });
});
