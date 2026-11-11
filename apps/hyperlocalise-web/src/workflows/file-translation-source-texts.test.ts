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

import { sourceContainsTerm } from "@/lib/glossary/validate-glossary-terms-in-translation";

import {
  FILE_GUIDELINE_SOURCE_MAX_CHARS,
  resolveFileTranslationSourceTexts,
} from "./file-translation-source-texts";

describe("resolveFileTranslationSourceTexts", () => {
  it("keeps a late glossary term on the full source after guideline truncation", () => {
    const lateTerm = "BrandNameOnlyAfterCap";
    const source = `${"a".repeat(FILE_GUIDELINE_SOURCE_MAX_CHARS)}${lateTerm}`;
    const { glossarySourceText, guidelineSourceText } = resolveFileTranslationSourceTexts(source);

    expect(guidelineSourceText).toHaveLength(FILE_GUIDELINE_SOURCE_MAX_CHARS);
    expect(guidelineSourceText.includes(lateTerm)).toBe(false);
    expect(
      sourceContainsTerm(glossarySourceText, { sourceTerm: lateTerm, caseSensitive: true }),
    ).toBe(true);
  });

  it("leaves short sources unchanged for both uses", () => {
    const source = "Keep the brand name Checkout.";
    expect(resolveFileTranslationSourceTexts(source)).toEqual({
      glossarySourceText: source,
      guidelineSourceText: source,
    });
  });
});
