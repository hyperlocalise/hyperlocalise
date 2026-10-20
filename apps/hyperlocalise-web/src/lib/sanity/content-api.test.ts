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
  collectInternationalizedArrayLanguages,
  curateSanityLanguageTags,
  isSameSanityDocumentId,
  nextSanityTranslationMetadataDocument,
  omitSanitySystemFields,
  readSanityTranslationMetadataLinks,
  resolveSanityTranslatedDocumentId,
  sanityTranslationMetadataLocale,
} from "./content-api";

describe("curateSanityLanguageTags", () => {
  it("drops tags that are not configured locale documents", () => {
    expect(curateSanityLanguageTags(["en", "de", "ja"], ["en", "de"])).toEqual(["de", "en"]);
  });

  it("keeps all discovered tags when no locale catalog exists", () => {
    expect(curateSanityLanguageTags(["en", "ja"], [])).toEqual(["en", "ja"]);
  });
});

describe("collectInternationalizedArrayLanguages", () => {
  it("reads language tags from internationalized array fields", () => {
    expect(
      collectInternationalizedArrayLanguages({
        _type: "landingPage",
        title: [
          { _type: "internationalizedArrayStringValue", language: "en", value: "Home" },
          { _type: "internationalizedArrayStringValue", language: "de", value: "Start" },
        ],
        slug: "home",
      }),
    ).toEqual(["en", "de"]);
  });

  it("ignores arrays that are not Sanity internationalized fields", () => {
    expect(
      collectInternationalizedArrayLanguages({
        _type: "product",
        variants: [{ language: "en", value: "unused" }],
      }),
    ).toEqual([]);
  });
});

describe("sanity translated document ids", () => {
  it("resolves published ids by locale tag and ignores the source document", () => {
    expect(
      resolveSanityTranslatedDocumentId({ en: "drafts.post-en", "de-DE": "post-de" }, "de-DE"),
    ).toBe("post-de");
    expect(resolveSanityTranslatedDocumentId({ en: "post-en" }, "en-US")).toBeUndefined();
    expect(isSameSanityDocumentId("drafts.post-en", "post-en")).toBe(true);
    expect(
      omitSanitySystemFields({
        _id: "post-en",
        _rev: "rev",
        _type: "post",
        language: "en",
        title: "Hello",
      }),
    ).toEqual({ _type: "post", language: "en", title: "Hello" });
  });
});

describe("sanity translation metadata", () => {
  it("reads language first and falls back to _key", () => {
    expect(sanityTranslationMetadataLocale({ language: "de", _key: "uuid-1" })).toBe("de");
    expect(sanityTranslationMetadataLocale({ _key: "fr" })).toBe("fr");
    expect(sanityTranslationMetadataLocale({})).toBeNull();
  });

  it("matches existing links by language and keeps custom metadata fields", () => {
    const next = nextSanityTranslationMetadataDocument({
      existing: {
        _id: "meta-1",
        _rev: "rev",
        _type: "translation.metadata",
        slug: { _type: "slug", current: "lesson" },
        schemaTypes: ["lesson"],
        translations: [
          {
            _key: "uuid-en",
            _type: "internationalizedArrayReferenceValue",
            language: "en",
            value: { _type: "reference", _ref: "lesson-en", _weak: true },
          },
        ],
      },
      sourceLocale: "en",
      sourceDocumentId: "lesson-en",
      targetLocale: "de",
      targetDocumentId: "lesson-de",
      documentType: "lesson",
    });

    expect(next.slug).toEqual({ _type: "slug", current: "lesson" });
    expect(next.translations).toEqual([
      {
        _key: "uuid-en",
        _type: "internationalizedArrayReferenceValue",
        language: "en",
        value: { _type: "reference", _ref: "lesson-en", _weak: true },
      },
      {
        _key: "de",
        _type: "internationalizedArrayReferenceValue",
        language: "de",
        value: { _type: "reference", _ref: "lesson-de", _weak: true },
      },
    ]);
  });

  it("does not append a duplicate when the locale already lives on language", () => {
    const next = nextSanityTranslationMetadataDocument({
      existing: {
        _type: "translation.metadata",
        translations: [
          {
            _key: "uuid-de",
            _type: "internationalizedArrayReferenceValue",
            language: "de",
            value: { _type: "reference", _ref: "old-de", _weak: true },
          },
        ],
      },
      sourceLocale: "",
      sourceDocumentId: "lesson-en",
      targetLocale: "de",
      targetDocumentId: "lesson-de",
      documentType: "lesson",
    });

    expect(next.translations).toHaveLength(1);
    expect(next.translations).toEqual([
      {
        _key: "uuid-de",
        _type: "internationalizedArrayReferenceValue",
        language: "de",
        value: { _type: "reference", _ref: "lesson-de", _weak: true },
      },
    ]);
  });

  it("reads metadata links from language with a _key fallback", () => {
    expect(
      readSanityTranslationMetadataLinks([
        { language: "de", _key: "uuid-de", ref: "drafts.lesson-de" },
        { _key: "fr", ref: "lesson-fr" },
        { language: "ja" },
      ]),
    ).toEqual([
      { sanityLocale: "de", documentRef: "lesson-de" },
      { sanityLocale: "fr", documentRef: "lesson-fr" },
    ]);
  });
});
