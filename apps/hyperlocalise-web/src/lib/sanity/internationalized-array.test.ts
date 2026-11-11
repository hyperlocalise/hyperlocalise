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
  isSanityInternationalizedArrayEntry,
  sanityInternationalizedEntryLanguage,
  upsertSanityInternationalizedEntry,
} from "./internationalized-array";

describe("internationalized-array locale tags", () => {
  it("reads language from the language field", () => {
    const entry = {
      _type: "internationalizedArrayStringValue",
      _key: "en",
      language: "en",
      value: "Hello",
    };
    expect(isSanityInternationalizedArrayEntry(entry)).toBe(true);
    expect(sanityInternationalizedEntryLanguage(entry)).toBe("en");
  });

  it("reads language from _key when language is missing", () => {
    const entry = {
      _type: "internationalizedArrayStringValue",
      _key: "de",
      value: "Hallo",
    };
    expect(isSanityInternationalizedArrayEntry(entry)).toBe(true);
    expect(sanityInternationalizedEntryLanguage(entry)).toBe("de");
    expect(
      collectInternationalizedArrayLanguages({
        title: [entry],
      }),
    ).toEqual(["de"]);
  });

  it("upserts without language when siblings only use _key", () => {
    const next = upsertSanityInternationalizedEntry(
      [{ _type: "internationalizedArrayStringValue", _key: "en", value: "Hello" }],
      "de",
      "Hallo",
    );
    expect(next).toHaveLength(2);
    const created = next[1];
    expect(isSanityInternationalizedArrayEntry(created)).toBe(true);
    if (isSanityInternationalizedArrayEntry(created)) {
      expect(created._key).toBe("de");
      expect(created.language).toBeUndefined();
      expect(created.value).toBe("Hallo");
    }
  });

  it("upserts with language when siblings use language", () => {
    const next = upsertSanityInternationalizedEntry(
      [
        {
          _type: "internationalizedArrayStringValue",
          _key: "en",
          language: "en",
          value: "Hello",
        },
      ],
      "de",
      "Hallo",
    );
    const created = next[1];
    expect(isSanityInternationalizedArrayEntry(created)).toBe(true);
    if (isSanityInternationalizedArrayEntry(created)) {
      expect(created.language).toBe("de");
    }
  });
});
