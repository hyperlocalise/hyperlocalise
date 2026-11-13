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
  supportsTranslationAsSource,
  TRANSLATION_AS_SOURCE_UPLOAD_SURFACE,
} from "./translation-as-source-support";

describe("supportsTranslationAsSource", () => {
  it("allows Word and Excel files, including an old .xls workbook", () => {
    expect(supportsTranslationAsSource("requests/report.docx")).toBe(true);
    expect(supportsTranslationAsSource("Locales/EN.DOCX")).toBe(true);
    expect(supportsTranslationAsSource("prices.xlsx")).toBe(true);
    expect(supportsTranslationAsSource("legacy/budget.XLS")).toBe(true);
  });

  it("refuses other office formats and string files", () => {
    expect(supportsTranslationAsSource("requests/deck.pptx")).toBe(false);
    expect(supportsTranslationAsSource("guide.pdf")).toBe(false);
    expect(supportsTranslationAsSource("locales/en.json")).toBe(false);
    expect(supportsTranslationAsSource("")).toBe(false);
  });

  it("uses a dedicated upload surface so a send is not treated as a hand upload", () => {
    expect(TRANSLATION_AS_SOURCE_UPLOAD_SURFACE).toBe("translation_as_source");
  });
});
