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
import { describe, expect, it, vi } from "vite-plus/test";

import { CrowdinApiClient } from "./crowdin-api";
import { crowdinTmsProvider } from "./crowdin-provider";

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

    const result = await crowdinTmsProvider.searchCatConcordance({
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

    const result = await crowdinTmsProvider.searchCatConcordance({
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
    expect(result.glossaryTerms[0]?.concept).toMatchObject({
      id: "1",
      primaryTerm: "workspace",
      glossaryUrl: "https://crowdin.com/glossary/7",
      sourceTerms: [
        expect.objectContaining({
          id: "11",
          text: "workspace",
          preferred: true,
          forbidden: false,
        }),
      ],
      targetTerms: [
        expect.objectContaining({
          id: "12",
          text: "espace",
          preferred: false,
          forbidden: true,
        }),
      ],
    });
  });

  it("falls back concept id and glossary URL when Crowdin omits concept or webUrl", async () => {
    const client = {
      glossaryConcordanceSearch: vi.fn().mockResolvedValue([
        {
          glossary: { id: 9, name: "Product terms", webUrl: "javascript:alert(1)" },
          concept: null,
          sourceTerms: [{ id: 21, languageId: "en", text: "dashboard", status: "preferred" }],
          targetTerms: [{ id: 22, languageId: "fr", text: "tableau de bord", status: "preferred" }],
        },
      ]),
      concordanceSearch: vi.fn().mockResolvedValue([]),
    } as unknown as CrowdinApiClient;

    const result = await crowdinTmsProvider.searchCatConcordance({
      client,
      externalProjectId: "42",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "dashboard",
    });

    expect(result.glossaryTerms[0]?.concept).toMatchObject({
      id: "21",
      primaryTerm: "dashboard",
      glossaryUrl: "https://crowdin.com/glossary/9",
    });
  });

  it("uses Crowdin glossary webUrl when it is a safe https URL", async () => {
    const client = {
      glossaryConcordanceSearch: vi.fn().mockResolvedValue([
        {
          glossary: {
            id: 7,
            name: "Product terms",
            webUrl: "https://acme.crowdin.com/u/projects/1/glossary/7",
          },
          concept: {
            id: 3,
            subject: "UI",
            definition: "Product workspace",
            translatable: true,
            note: "",
            url: "",
            figure: "",
          },
          sourceTerms: [{ id: 11, languageId: "en", text: "workspace", status: "preferred" }],
          targetTerms: [
            { id: 12, languageId: "fr", text: "espace de travail", status: "preferred" },
          ],
        },
      ]),
      concordanceSearch: vi.fn().mockResolvedValue([]),
    } as unknown as CrowdinApiClient;

    const result = await crowdinTmsProvider.searchCatConcordance({
      client,
      externalProjectId: "42",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "workspace",
    });

    expect(result.glossaryTerms[0]?.concept).toMatchObject({
      id: "3",
      subject: "UI",
      definition: "Product workspace",
      glossaryUrl: "https://acme.crowdin.com/u/projects/1/glossary/7",
    });
  });
});
