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

import { isUntranslatedTranslation, shouldPrefillTranslation } from "./translation-prefill";

describe("isUntranslatedTranslation", () => {
  it("treats empty and whitespace-only targets as untranslated", () => {
    expect(isUntranslatedTranslation({ targetText: null })).toBe(true);
    expect(isUntranslatedTranslation({ targetText: "" })).toBe(true);
    expect(isUntranslatedTranslation({ targetText: "   " })).toBe(true);
  });

  it("treats rejected rows as untranslated even when text is present", () => {
    expect(isUntranslatedTranslation({ targetText: "Bonjour", status: "rejected" })).toBe(true);
  });

  it("treats non-empty approved and needs-review targets as translated", () => {
    expect(isUntranslatedTranslation({ targetText: "Bonjour", status: "approved" })).toBe(false);
    expect(isUntranslatedTranslation({ targetText: "Bonjour", status: "needs_review" })).toBe(
      false,
    );
    expect(
      isUntranslatedTranslation({
        targetText: "Enable workspace knowledge",
        status: "needs_review",
      }),
    ).toBe(false);
  });
});

describe("shouldPrefillTranslation", () => {
  it("prefills only translated rows", () => {
    expect(shouldPrefillTranslation({ targetText: "Bonjour", status: "approved" })).toBe(true);
    expect(shouldPrefillTranslation({ targetText: "", status: "needs_review" })).toBe(false);
  });
});
