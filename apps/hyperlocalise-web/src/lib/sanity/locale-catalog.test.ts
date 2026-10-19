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
  assertSanityLocaleCatalogConfig,
  isValidSanitySchemaFieldName,
  listUnsupportedSanitySourceDocumentTypes,
  pickSanityLocaleSource,
} from "./locale-catalog";

describe("locale catalog helpers", () => {
  it("validates schema field identifiers", () => {
    expect(isValidSanitySchemaFieldName("tag")).toBe(true);
    expect(isValidSanitySchemaFieldName("tag) || true")).toBe(false);
  });

  it("rejects invalid catalog config", () => {
    expect(() =>
      assertSanityLocaleCatalogConfig({
        documentType: "locale",
        tagField: "tag;drop",
        titleField: "name",
      }),
    ).toThrow("sanity_locale_catalog_config_invalid");
  });

  it("picks locale source from catalog vs inferred counts", () => {
    expect(pickSanityLocaleSource(2, 0)).toBe("catalog");
    expect(pickSanityLocaleSource(0, 3)).toBe("inferred");
    expect(pickSanityLocaleSource(0, 0)).toBe("none");
  });

  it("lists document types that do not support the source locale", () => {
    const unsupported = listUnsupportedSanitySourceDocumentTypes({
      sourceLocale: "en",
      documentTypes: ["post", "author"],
      languagesByType: {
        post: ["en", "de"],
        author: ["de"],
      },
      fallbackLanguages: ["en", "de"],
      typeLanguages: new Map([
        ["post", ["en", "de"]],
        ["author", ["de"]],
      ]),
    });
    expect(unsupported).toEqual(["author"]);
  });
});
