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

import { mapCatConcordanceForAiRecommendation } from "./content-editor-recommendation-mapper";

describe("mapCatConcordanceForAiRecommendation", () => {
  it("drops glossary terms with blank targets and keeps TM matches", () => {
    const mapped = mapCatConcordanceForAiRecommendation(
      {
        glossaryTerms: [
          {
            id: "g1",
            source: "Save",
            target: "Enregistrer",
            approved: true,
            forbidden: false,
          },
          {
            id: "g2",
            source: "Draft term",
            target: "   ",
            approved: false,
            forbidden: false,
          },
          {
            id: "g3",
            source: "Legacy",
            target: "Ancien",
            approved: true,
            forbidden: true,
          },
        ],
        translationMemoryMatches: [
          {
            id: "tm1",
            sourceText: "Hello",
            targetText: "Bonjour",
            matchPercent: 100,
          },
        ],
      },
      "fr",
    );

    expect(mapped.glossaryTerms).toEqual([
      {
        sourceTerm: "Save",
        targetTerm: "Enregistrer",
        targetLocale: "fr",
        forbidden: false,
        description: null,
      },
      {
        sourceTerm: "Legacy",
        targetTerm: "Ancien",
        targetLocale: "fr",
        forbidden: true,
        description: null,
      },
    ]);
    expect(mapped.translationMemoryMatches).toEqual([
      {
        sourceText: "Hello",
        targetText: "Bonjour",
        targetLocale: "fr",
      },
    ]);
  });
});
