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

import { applySanityTranslationsToDocument } from "./apply-translations";

describe("applySanityTranslationsToDocument", () => {
  it("document-level copies strings onto a language-specific document", () => {
    const next = applySanityTranslationsToDocument({
      i18nMode: "document",
      targetSanityLocale: "de",
      document: {
        _id: "post-en",
        _type: "post",
        language: "en",
        title: "Hello",
      },
      translations: { title: "Hallo" },
    });

    expect(next.language).toBe("de");
    expect(next.title).toBe("Hallo");
    expect(next._id).toBe("post-en");
  });

  it("field-level upserts the target locale and keeps the source locale", () => {
    const next = applySanityTranslationsToDocument({
      i18nMode: "field",
      sourceSanityLocale: "en-US",
      targetSanityLocale: "de",
      document: {
        _type: "product",
        title: [
          {
            _type: "internationalizedArrayStringValue",
            _key: "en-US",
            language: "en-US",
            value: "Hello",
          },
        ],
      },
      translations: { title: "Hallo" },
    });

    expect(next.language).toBeUndefined();
    expect(next.title).toEqual([
      {
        _type: "internationalizedArrayStringValue",
        _key: "en-US",
        language: "en-US",
        value: "Hello",
      },
      {
        _type: "internationalizedArrayStringValue",
        _key: "de",
        language: "de",
        value: "Hallo",
      },
    ]);
  });

  it("field-level keeps sibling locales when applying a second target", () => {
    const withGerman = applySanityTranslationsToDocument({
      i18nMode: "field",
      sourceSanityLocale: "en-US",
      targetSanityLocale: "de",
      document: {
        title: [
          {
            _type: "internationalizedArrayStringValue",
            language: "en-US",
            value: "Hello",
          },
        ],
      },
      translations: { title: "Hallo" },
    });
    const withFrench = applySanityTranslationsToDocument({
      i18nMode: "field",
      sourceSanityLocale: "en-US",
      targetSanityLocale: "fr",
      document: withGerman,
      translations: { title: "Bonjour" },
    });

    const languages = (withFrench.title as Array<{ language: string }>).map(
      (entry) => entry.language,
    );
    expect(languages).toEqual(["en-US", "de", "fr"]);
  });

  it("field-level does not wrap plain strings into internationalized arrays", () => {
    const next = applySanityTranslationsToDocument({
      i18nMode: "field",
      targetSanityLocale: "de",
      document: {
        _type: "product",
        sku: "SKU-1",
        title: "Hello",
      },
      translations: { title: "Hallo" },
    });

    expect(next.title).toBe("Hello");
    expect(next.sku).toBe("SKU-1");
  });

  it("document-level writes portable text spans through array path segments", () => {
    const next = applySanityTranslationsToDocument({
      i18nMode: "document",
      targetSanityLocale: "de",
      document: {
        _type: "page",
        language: "en",
        title: "Welcome",
        body: [
          {
            _type: "block",
            children: [{ _type: "span", text: "Hello" }],
          },
        ],
      },
      translations: {
        title: "Willkommen",
        "body.0.children.0.text": "Hallo",
      },
    });

    expect(next.title).toBe("Willkommen");
    expect(next.body).toEqual([
      {
        _type: "block",
        children: [{ _type: "span", text: "Hallo" }],
      },
    ]);
  });

  it("field-level writes portable text spans inside the locale slot", () => {
    const next = applySanityTranslationsToDocument({
      i18nMode: "field",
      sourceSanityLocale: "en",
      targetSanityLocale: "de",
      document: {
        _type: "page",
        body: [
          {
            _type: "internationalizedArrayPortableTextValue",
            language: "en",
            value: [
              {
                _type: "block",
                children: [{ _type: "span", text: "Hello" }],
              },
            ],
          },
        ],
      },
      translations: { "body.0.children.0.text": "Hallo" },
    });

    expect(next.body).toEqual([
      {
        _type: "internationalizedArrayPortableTextValue",
        language: "en",
        value: [
          {
            _type: "block",
            children: [{ _type: "span", text: "Hello" }],
          },
        ],
      },
      {
        _type: "internationalizedArrayPortableTextValue",
        language: "de",
        _key: "de",
        value: [
          {
            _type: "block",
            children: [{ _type: "span", text: "Hallo" }],
          },
        ],
      },
    ]);
  });
});
