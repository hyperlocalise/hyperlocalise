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
  compareConceptDetailCreatingTerms,
  compareConceptDetailTermGroupLocale,
  sortConceptDetailCreatingTerms,
  sortConceptDetailPersistedTerms,
  sortConceptDetailTermGroups,
} from "./concept-detail-term-order";

describe("compareConceptDetailTermGroupLocale", () => {
  it("ranks the source locale before other locales", () => {
    expect(compareConceptDetailTermGroupLocale("en-US", "fr-FR", "en-US")).toBeLessThan(0);
    expect(compareConceptDetailTermGroupLocale("fr-FR", "en-US", "en-US")).toBeGreaterThan(0);
  });

  it("sorts non-source locales alphabetically", () => {
    expect(compareConceptDetailTermGroupLocale("de-DE", "fr-FR", "en-US")).toBeLessThan(0);
  });
});

describe("sortConceptDetailTermGroups", () => {
  it("puts the source locale group first", () => {
    const groups = sortConceptDetailTermGroups(
      [
        {
          locale: "vi-VN",
          terms: [{ id: "3", isPrimary: false, status: "draft", term: "Đại lý" }],
        },
        {
          locale: "en-US",
          terms: [{ id: "1", isPrimary: true, status: "preferred", term: "Agency" }],
        },
        {
          locale: "de-DE",
          terms: [{ id: "2", isPrimary: false, status: "draft", term: "Agentur" }],
        },
      ],
      "en-US",
      sortConceptDetailPersistedTerms,
    );

    expect(groups.map((group) => group.locale)).toEqual(["en-US", "de-DE", "vi-VN"]);
    expect(groups[0]?.terms.map((term) => term.id)).toEqual(["1"]);
  });

  it("does not mutate the input groups or terms", () => {
    const input = [
      {
        locale: "vi-VN",
        terms: [{ id: "2", isPrimary: false, status: "draft", term: "Đại lý" }],
      },
      {
        locale: "en-US",
        terms: [{ id: "1", isPrimary: true, status: "preferred", term: "Agency" }],
      },
    ];

    sortConceptDetailTermGroups(input, "en-US", sortConceptDetailPersistedTerms);

    expect(input.map((group) => group.locale)).toEqual(["vi-VN", "en-US"]);
    expect(input[0]?.terms.map((term) => term.id)).toEqual(["2"]);
  });
});

describe("sortConceptDetailPersistedTerms", () => {
  it("ranks primary and preferred source terms first", () => {
    const input = [
      { id: "3", isPrimary: false, status: "admitted", term: "Checkout" },
      { id: "1", isPrimary: true, status: "draft", term: "Agency" },
      { id: "2", isPrimary: false, status: "preferred", term: "Payment" },
    ];
    const terms = sortConceptDetailPersistedTerms(input);

    expect(terms.map((term) => term.id)).toEqual(["1", "2", "3"]);
    expect(input.map((term) => term.id)).toEqual(["3", "1", "2"]);
  });
});

describe("sortConceptDetailCreatingTerms", () => {
  it("keeps the seeded source term before additional drafts in the same locale", () => {
    expect(
      compareConceptDetailCreatingTerms(
        { id: "new-source-en-US", status: "draft", term: "" },
        { id: "new-abc", status: "draft", term: "Variant" },
      ),
    ).toBeLessThan(0);

    const terms = sortConceptDetailCreatingTerms([
      { id: "new-abc", status: "draft", term: "Variant" },
      { id: "new-source-en-US", status: "draft", term: "Agency" },
    ]);

    expect(terms.map((term) => term.id)).toEqual(["new-source-en-US", "new-abc"]);
  });

  it("ranks preferred drafts ahead of the seeded source term", () => {
    const terms = sortConceptDetailCreatingTerms([
      { id: "new-source-en-US", status: "draft", term: "Agency" },
      { id: "new-abc", status: "preferred", term: "Payment" },
    ]);

    expect(terms.map((term) => term.id)).toEqual(["new-abc", "new-source-en-US"]);
  });
});
