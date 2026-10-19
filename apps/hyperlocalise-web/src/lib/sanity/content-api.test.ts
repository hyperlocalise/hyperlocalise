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
  omitSanitySystemFields,
  resolveSanityTranslatedDocumentId,
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
