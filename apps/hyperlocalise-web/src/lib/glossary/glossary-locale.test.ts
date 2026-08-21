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

import { selectGlossaryPrimaryTerm, type GlossaryConceptTerm } from "./glossary";
import { toCrowdinConceptInput, toGlossaryConcept } from "./crowdin-glossary";

describe("shared glossary locale contract", () => {
  it("selects primary terms using locale only", () => {
    const terms: GlossaryConceptTerm[] = [
      { id: 2, locale: "en-US", text: "Checkout", status: "admitted" },
      { id: 1, locale: "en-US", text: "Payment", status: "draft" },
      { id: 3, locale: "fr-CA", text: "Paiement", status: "preferred" },
    ];

    expect(selectGlossaryPrimaryTerm(terms, "en-US")).toMatchObject({
      id: 1,
      locale: "en-US",
      text: "Payment",
    });
    expect(selectGlossaryPrimaryTerm(terms, "fr-CA")).toMatchObject({
      id: 3,
      locale: "fr-CA",
      text: "Paiement",
    });
  });

  it("round-trips Crowdin concepts through preferred project locales", () => {
    const crowdin = toCrowdinConceptInput({
      primaryTerm: "Checkout",
      sourceLocale: "en-US",
      terms: [
        {
          id: 10,
          locale: "en-US",
          text: "Checkout",
          status: "preferred",
          partOfSpeech: "noun",
        },
        {
          id: 11,
          locale: "fr-CA",
          text: "Paiement",
          status: "draft",
          partOfSpeech: "noun",
        },
        {
          id: 12,
          locale: "vi-VN",
          text: "Thanh toán",
          status: "draft",
          partOfSpeech: "noun",
        },
      ],
    });

    expect(crowdin.terms).toMatchObject([
      { id: 10, languageId: "en", text: "Checkout", status: "preferred" },
      { id: 11, languageId: "fr-CA", text: "Paiement", status: "draft" },
      { id: 12, languageId: "vi", text: "Thanh toán", status: "draft" },
    ]);
    expect(crowdin).not.toHaveProperty("terms.0.locale");

    const native = toGlossaryConcept(crowdin, ["en-US", "fr-CA", "vi-VN"]);
    expect(native.terms).toMatchObject([
      { id: 10, locale: "en-US", text: "Checkout", status: "preferred", partOfSpeech: "noun" },
      { id: 11, locale: "fr-CA", text: "Paiement", status: "draft", partOfSpeech: "noun" },
      { id: 12, locale: "vi-VN", text: "Thanh toán", status: "draft", partOfSpeech: "noun" },
    ]);
    for (const term of native.terms) {
      expect(term).not.toHaveProperty("languageId");
    }
  });
});
