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

import {
  flattenNativeConceptTermsToPairs,
  type NativeConceptGroup,
} from "./flatten-native-glossary-pairs";

function baseTerm(overrides: Partial<NativeConceptGroup["terms"][number]> = {}) {
  return {
    id: "term-1",
    locale: "en",
    term: "checkout",
    status: "preferred",
    description: "",
    partOfSpeech: "",
    caseSensitive: false,
    provenance: "manual",
    reviewStatus: "approved",
    ...overrides,
  };
}

describe("flattenNativeConceptTermsToPairs", () => {
  it("returns preferred target pairs and marks not_recommended alternatives as forbidden", () => {
    const concepts: NativeConceptGroup[] = [
      {
        conceptId: "concept-1",
        glossaryId: "glossary-1",
        glossaryName: "Commerce",
        translatable: true,
        terms: [
          baseTerm({ id: "source-1", locale: "en", term: "checkout", status: "preferred" }),
          {
            ...baseTerm({
              id: "target-preferred",
              locale: "fr",
              term: "paiement",
              status: "preferred",
            }),
          },
          {
            ...baseTerm({
              id: "target-deprecated",
              locale: "fr",
              term: "caisse",
              status: "not_recommended",
            }),
          },
        ],
      },
    ];

    const pairs = flattenNativeConceptTermsToPairs({
      concepts,
      sourceLocale: "en",
      targetLocales: ["fr"],
    });

    expect(pairs).toEqual([
      expect.objectContaining({
        sourceTerm: "checkout",
        targetTerm: "paiement",
        targetLocale: "fr",
        forbidden: false,
      }),
      expect.objectContaining({
        sourceTerm: "checkout",
        targetTerm: "caisse",
        targetLocale: "fr",
        forbidden: true,
      }),
    ]);
  });

  it("synthesizes source-to-source pairs for non-translatable concepts", () => {
    const concepts: NativeConceptGroup[] = [
      {
        conceptId: "concept-1",
        glossaryId: "glossary-1",
        glossaryName: "Brand",
        translatable: false,
        terms: [baseTerm({ id: "source-1", locale: "en", term: "Hyperlocalise" })],
      },
    ];

    const pairs = flattenNativeConceptTermsToPairs({
      concepts,
      sourceLocale: "en",
      targetLocales: ["fr", "de"],
    });

    expect(pairs).toEqual([
      expect.objectContaining({
        sourceTerm: "Hyperlocalise",
        targetTerm: "Hyperlocalise",
        targetLocale: "de",
        forbidden: false,
      }),
      expect.objectContaining({
        sourceTerm: "Hyperlocalise",
        targetTerm: "Hyperlocalise",
        targetLocale: "fr",
        forbidden: false,
      }),
    ]);
  });

  it("does not forbid preferred targets because a source synonym is not_recommended", () => {
    const concepts: NativeConceptGroup[] = [
      {
        conceptId: "concept-1",
        glossaryId: "glossary-1",
        glossaryName: "Commerce",
        translatable: true,
        terms: [
          baseTerm({ id: "source-preferred", locale: "en", term: "checkout", status: "preferred" }),
          baseTerm({
            id: "source-deprecated",
            locale: "en",
            term: "cart",
            status: "not_recommended",
          }),
          baseTerm({
            id: "target-preferred",
            locale: "fr",
            term: "paiement",
            status: "preferred",
          }),
        ],
      },
    ];

    const pairs = flattenNativeConceptTermsToPairs({
      concepts,
      sourceLocale: "en",
      targetLocales: ["fr"],
    });

    expect(pairs).toEqual([
      expect.objectContaining({
        sourceTerm: "cart",
        targetTerm: "paiement",
        forbidden: false,
      }),
      expect.objectContaining({
        sourceTerm: "checkout",
        targetTerm: "paiement",
        forbidden: false,
      }),
    ]);
  });

  it("sorts flattened pairs by glossary attachment priority", () => {
    const concepts: NativeConceptGroup[] = [
      {
        conceptId: "concept-low",
        glossaryId: "glossary-low",
        glossaryName: "Low Priority",
        translatable: true,
        terms: [
          baseTerm({ id: "low-source", locale: "en", term: "zebra" }),
          baseTerm({ id: "low-target", locale: "fr", term: "zebre", status: "preferred" }),
        ],
      },
      {
        conceptId: "concept-high",
        glossaryId: "glossary-high",
        glossaryName: "High Priority",
        translatable: true,
        terms: [
          baseTerm({ id: "high-source", locale: "en", term: "alpha" }),
          baseTerm({ id: "high-target", locale: "fr", term: "alpha-fr", status: "preferred" }),
        ],
      },
    ];

    const pairs = flattenNativeConceptTermsToPairs({
      concepts,
      sourceLocale: "en",
      targetLocales: ["fr"],
      glossaryPriority: new Map([
        ["glossary-high", 1],
        ["glossary-low", 2],
      ]),
    });

    expect(pairs.map((pair) => pair.glossaryId)).toEqual(["glossary-high", "glossary-low"]);
  });

  it("sorts required target pairs before forbidden alternatives", () => {
    const concepts: NativeConceptGroup[] = [
      {
        conceptId: "concept-1",
        glossaryId: "glossary-1",
        glossaryName: "Commerce",
        translatable: true,
        terms: [
          baseTerm({ id: "source-1", locale: "en", term: "checkout", status: "preferred" }),
          baseTerm({
            id: "target-preferred",
            locale: "fr",
            term: "paiement",
            status: "preferred",
          }),
          baseTerm({
            id: "target-deprecated",
            locale: "fr",
            term: "caisse",
            status: "not_recommended",
          }),
        ],
      },
    ];

    const pairs = flattenNativeConceptTermsToPairs({
      concepts,
      sourceLocale: "en",
      targetLocales: ["fr"],
      glossaryPriority: new Map([["glossary-1", 1]]),
    });

    expect(pairs.map((pair) => pair.targetTerm)).toEqual(["paiement", "caisse"]);
  });
});
