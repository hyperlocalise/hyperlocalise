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

import type { CrowdinApiClient } from "@/lib/providers/adapters/crowdin/crowdin-api";
import {
  loadCrowdinConcordanceTranslatableByConceptId,
  mapCrowdinGlossaryConcordanceSearchResult,
  resolveCrowdinConcordanceTranslatableFromResult,
  sortCrowdinConcordanceMatches,
} from "@/lib/providers/adapters/crowdin/crowdin-glossary-concordance";
import { hasGlossaryExpectedTarget } from "@/lib/providers/contracts/glossary-match";

describe("mapCrowdinGlossaryConcordanceSearchResult", () => {
  it("maps untranslatable concepts with source as the expected target", () => {
    const match = mapCrowdinGlossaryConcordanceSearchResult({
      result: {
        glossary: { id: 7, name: "Brand terms" },
        concept: { id: 3, translatable: false },
        sourceTerms: [{ id: 11, languageId: "en", text: "Hyperlocalise", status: "preferred" }],
        targetTerms: [{ id: 12, languageId: "fr", text: "Hyperlocalise FR", status: "preferred" }],
      },
      index: 0,
      resourceId: "glossary-1",
      glossaryName: "Brand terms",
      sourceLocale: "en",
      targetLocale: "fr",
      translatable: false,
    });

    expect(match).toMatchObject({
      sourceTerm: "Hyperlocalise",
      targetTerm: "Hyperlocalise",
      concept: {
        translatable: false,
      },
    });
    expect(hasGlossaryExpectedTarget(match!)).toBe(true);
  });

  it("keeps source-only translatable concepts with an empty target term", () => {
    const match = mapCrowdinGlossaryConcordanceSearchResult({
      result: {
        glossary: { id: 7, name: "Product terms" },
        concept: { id: 4, translatable: true },
        sourceTerms: [{ id: 11, languageId: "en", text: "Dashboard", status: "draft" }],
        targetTerms: [],
      },
      index: 0,
      resourceId: "glossary-1",
      glossaryName: "Product terms",
      sourceLocale: "en",
      targetLocale: "fr",
      translatable: true,
    });

    expect(match).toMatchObject({
      sourceTerm: "Dashboard",
      targetTerm: "",
      concept: {
        translatable: true,
        targetTerms: [],
      },
    });
    expect(hasGlossaryExpectedTarget(match!)).toBe(false);
  });

  it("drops matches without a source term", () => {
    const match = mapCrowdinGlossaryConcordanceSearchResult({
      result: {
        glossary: { id: 7, name: "Product terms" },
        sourceTerms: [],
        targetTerms: [{ id: 12, languageId: "fr", text: "Tableau de bord", status: "preferred" }],
      },
      index: 0,
      resourceId: "glossary-1",
      glossaryName: "Product terms",
      sourceLocale: "en",
      targetLocale: "fr",
    });

    expect(match).toBeNull();
  });
});

describe("resolveCrowdinConcordanceTranslatableFromResult", () => {
  it("uses concordance concept translatable when present", () => {
    expect(
      resolveCrowdinConcordanceTranslatableFromResult({
        glossary: { id: 1, name: "Glossary" },
        sourceTerms: [{ id: 1, languageId: "en", text: "API" }],
        targetTerms: [],
        concept: { id: 2, translatable: false },
      }),
    ).toBe(false);
  });

  it("falls back to loaded concept translatable by id", () => {
    expect(
      resolveCrowdinConcordanceTranslatableFromResult(
        {
          glossary: { id: 1, name: "Glossary" },
          sourceTerms: [{ id: 1, conceptId: 2, languageId: "en", text: "API" }],
          targetTerms: [],
          concept: null,
        },
        new Map([["1:2", false]]),
      ),
    ).toBe(false);
  });

  it("defaults to true when no concept id is available", () => {
    expect(
      resolveCrowdinConcordanceTranslatableFromResult({
        glossary: { id: 1, name: "Glossary" },
        sourceTerms: [{ id: 1, languageId: "en", text: "API" }],
        targetTerms: [{ id: 2, languageId: "fr", text: "API" }],
      }),
    ).toBe(true);
  });
});

describe("loadCrowdinConcordanceTranslatableByConceptId", () => {
  it("loads missing translatable flags with bounded concurrency", async () => {
    const getGlossaryConcept = vi.fn().mockResolvedValue({ translatable: false });
    const client = { getGlossaryConcept } as unknown as CrowdinApiClient;

    const resolved = await loadCrowdinConcordanceTranslatableByConceptId({
      client,
      results: [
        {
          glossary: { id: 7, name: "Brand terms" },
          sourceTerms: [{ id: 11, conceptId: 3, languageId: "en", text: "Hyperlocalise" }],
          targetTerms: [],
          concept: null,
        },
      ],
    });

    expect(getGlossaryConcept).toHaveBeenCalledWith(7, 3);
    expect(resolved.get("7:3")).toBe(false);
  });
});

describe("sortCrowdinConcordanceMatches", () => {
  it("ranks expected-target matches ahead of source-only matches", () => {
    const sourceOnly = mapCrowdinGlossaryConcordanceSearchResult({
      result: {
        glossary: { id: 7, name: "Product terms" },
        sourceTerms: [{ id: 11, languageId: "en", text: "Dashboard", status: "draft" }],
        targetTerms: [],
      },
      index: 0,
      resourceId: "glossary-1",
      glossaryName: "Product terms",
      sourceLocale: "en",
      targetLocale: "fr",
    })!;
    const withTarget = mapCrowdinGlossaryConcordanceSearchResult({
      result: {
        glossary: { id: 7, name: "Product terms" },
        sourceTerms: [{ id: 21, languageId: "en", text: "Save", status: "preferred" }],
        targetTerms: [{ id: 22, languageId: "fr", text: "Enregistrer", status: "preferred" }],
      },
      index: 1,
      resourceId: "glossary-1",
      glossaryName: "Product terms",
      sourceLocale: "en",
      targetLocale: "fr",
    })!;

    const sorted = sortCrowdinConcordanceMatches([sourceOnly, withTarget], 2);
    expect(sorted[0]?.sourceTerm).toBe("Save");
    expect(sorted[1]?.sourceTerm).toBe("Dashboard");
  });
});
