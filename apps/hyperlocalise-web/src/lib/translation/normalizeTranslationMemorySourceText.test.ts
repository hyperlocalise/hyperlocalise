/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { normalizeTranslationMemorySourceText } from "./normalizeTranslationMemorySourceText";

describe("normalizeTranslationMemorySourceText", () => {
  it("trims, case-folds, and collapses repeated whitespace", () => {
    expect(normalizeTranslationMemorySourceText("  Hello   WORLD \n\t again  ")).toBe(
      "hello world again",
    );
  });

  it("normalizes Unicode compatibility forms before deduping", () => {
    expect(normalizeTranslationMemorySourceText("Ｆｕｌｌｗｉｄｔｈ Café")).toBe("fullwidth café");
  });

  it("is idempotent", () => {
    const normalized = normalizeTranslationMemorySourceText("  Hello   WORLD  ");

    expect(normalizeTranslationMemorySourceText(normalized)).toBe(normalized);
  });
});
