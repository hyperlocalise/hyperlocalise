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
  filterTranslatableSanityDocumentTypes,
  isSanityDocumentTypeLocalizable,
  isSanityHelperDocumentType,
  sanityDocumentI18nModeLabel,
  sanityDocumentTypeTitle,
} from "./localization-mode";

describe("sanity localization mode", () => {
  it("filters to document- and field-level types only", () => {
    expect(
      filterTranslatableSanityDocumentTypes([
        { name: "article", i18nMode: "document", languages: ["en"] },
        { name: "author", i18nMode: "none", languages: [] },
        { name: "page", i18nMode: "field", languages: ["en", "de"] },
        { name: "locale", i18nMode: "document", languages: ["en"] },
        { name: "translation.metadata", i18nMode: "field", languages: ["en"] },
      ]).map((type) => type.name),
    ).toEqual(["article", "page"]);
  });

  it("labels schema type names the way Studio titles usually look", () => {
    expect(sanityDocumentTypeTitle("post")).toBe("Post");
    expect(sanityDocumentTypeTitle("landingPage")).toBe("Landing Page");
    expect(isSanityHelperDocumentType("locale")).toBe(true);
    expect(isSanityHelperDocumentType("post")).toBe(false);
  });

  it("labels i18n modes for the document type picker", () => {
    expect(isSanityDocumentTypeLocalizable("document")).toBe(true);
    expect(isSanityDocumentTypeLocalizable("none")).toBe(false);
    expect(sanityDocumentI18nModeLabel("field")).toBe("Field-level i18n");
  });
});
