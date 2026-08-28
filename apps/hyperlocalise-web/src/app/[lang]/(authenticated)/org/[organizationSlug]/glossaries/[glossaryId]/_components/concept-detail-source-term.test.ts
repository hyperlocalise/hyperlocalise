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
  selectConceptDetailPrimaryTermId,
  selectConceptDetailSourceTermText,
} from "./concept-detail-source-term";

describe("selectConceptDetailSourceTermText", () => {
  it("selects the preferred source-locale term", () => {
    expect(
      selectConceptDetailSourceTermText(
        [
          { id: "2", locale: "en-US", term: "Checkout", status: "admitted" },
          { id: "1", locale: "en-US", term: "Payment", status: "preferred" },
          { id: "3", locale: "fr-FR", term: "Paiement", status: "preferred" },
        ],
        "en-US",
      ),
    ).toBe("Payment");
  });

  it("uses the glossary fallback for source-locale terms without a preferred term", () => {
    expect(
      selectConceptDetailSourceTermText(
        [
          { id: "2", locale: "en-US", term: "Checkout", status: "admitted" },
          { id: "1", locale: "en-US", term: "Payment", status: "draft" },
          { id: "3", locale: "fr-FR", term: "Paiement", status: "preferred" },
        ],
        "en-US",
      ),
    ).toBe("Payment");
  });

  it("returns an empty string when no source-locale term exists", () => {
    expect(
      selectConceptDetailSourceTermText(
        [{ id: "1", locale: "fr-FR", term: "Paiement", status: "preferred" }],
        "en-US",
      ),
    ).toBe("");
  });

  it("keeps a blank unsaved term from displacing a persisted source term", () => {
    expect(
      selectConceptDetailSourceTermText(
        [
          { id: "1", locale: "en-US", term: "Payment", status: "draft" },
          { locale: "en-US", term: "", status: "draft" },
        ],
        "en-US",
      ),
    ).toBe("Payment");
  });
});

describe("selectConceptDetailPrimaryTermId", () => {
  it("returns the preferred source term id when one exists", () => {
    expect(
      selectConceptDetailPrimaryTermId(
        [
          { id: "2", locale: "en-US", term: "Checkout", status: "admitted" },
          { id: "1", locale: "en-US", term: "Payment", status: "preferred" },
        ],
        "en-US",
      ),
    ).toBe("1");
  });

  it("falls back to the lowest source term id when no preferred term exists", () => {
    expect(
      selectConceptDetailPrimaryTermId(
        [
          { id: "2", locale: "en-US", term: "Alpha", status: "draft" },
          { id: "1", locale: "en-US", term: "Zulu", status: "draft" },
        ],
        "en-US",
      ),
    ).toBe("1");
  });
});
