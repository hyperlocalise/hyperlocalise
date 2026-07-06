import { describe, expect, it, vi } from "vite-plus/test";

import { LokaliseApiClient } from "./lokalise-api";
import { searchLokaliseCatConcordance } from "./lokalise-cat-concordance";

describe("searchLokaliseCatConcordance", () => {
  it("maps Lokalise glossary and project-key TM matches without attached resource filtering", async () => {
    const listGlossaryTerms = vi.fn().mockResolvedValue([
      {
        id: 11,
        term: "workspace",
        description: "Product term",
        caseSensitive: false,
        translatable: true,
        forbidden: false,
        translations: [
          {
            languageId: 640,
            languageIso: "fr",
            translation: "espace de travail",
          },
        ],
        tags: [],
      },
    ]);
    const listProjectLanguages = vi
      .fn()
      .mockResolvedValue([{ langId: 640, langIso: "fr", langName: "French" }]);
    const listKeys = vi.fn().mockResolvedValue([
      {
        keyId: 99,
        keyName: { web: "sign_in" },
        translations: [
          { languageIso: "en", translation: "Sign in to your workspace" },
          {
            languageIso: "fr",
            translation: "Connectez-vous a votre espace de travail",
          },
        ],
      },
    ]);

    const client = {
      listGlossaryTerms,
      listProjectLanguages,
      listKeys,
    } as unknown as LokaliseApiClient;

    const result = await searchLokaliseCatConcordance({
      client,
      externalProjectId: "proj.123",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Sign in to your workspace",
    });

    expect(listGlossaryTerms).toHaveBeenCalledWith("proj.123");
    expect(listKeys).toHaveBeenCalledWith("proj.123", { includeTranslations: true });
    expect(result.glossaryTerms).toHaveLength(1);
    expect(result.glossaryTerms[0]).toMatchObject({
      sourceTerm: "workspace",
      targetTerm: "espace de travail",
      glossaryName: "Lokalise glossary (proj.123)",
      matchSource: "live_provider",
    });
    expect(result.translationMemoryMatches).toHaveLength(1);
    expect(result.translationMemoryMatches[0]).toMatchObject({
      sourceText: "Sign in to your workspace",
      targetText: "Connectez-vous a votre espace de travail",
      memoryName: "Lokalise translation memory (proj.123)",
      externalResourceId: "proj.123:translation-memory",
    });
  });

  it("maps forbidden Lokalise glossary terms into normalized term flags", async () => {
    const client = {
      listGlossaryTerms: vi.fn().mockResolvedValue([
        {
          id: 11,
          term: "workspace",
          description: null,
          caseSensitive: false,
          translatable: true,
          forbidden: true,
          translations: [
            {
              languageId: 640,
              languageIso: "fr",
              translation: "espace",
            },
          ],
          tags: [],
        },
      ]),
      listProjectLanguages: vi
        .fn()
        .mockResolvedValue([{ langId: 640, langIso: "fr", langName: "French" }]),
      listKeys: vi.fn().mockResolvedValue([]),
    } as unknown as LokaliseApiClient;

    const result = await searchLokaliseCatConcordance({
      client,
      externalProjectId: "proj.123",
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
