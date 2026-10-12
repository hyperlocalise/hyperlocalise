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

import { readTranslationEntries } from "./client";

describe("readTranslationEntries", () => {
  it("keeps string maps, locale UUID, and optional timestamps", () => {
    expect(
      readTranslationEntries({
        translations: [
          {
            translation_map: { hello: "Bonjour", skip: 1, empty: "" },
            locale: { uuid: " locale-fr ", name: "fr-FR", locale_key: "fr-fr" },
            updated_at: "2026-10-12T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual([
      {
        translation_map: { hello: "Bonjour", empty: "" },
        locale: {
          uuid: "locale-fr",
          name: "fr-FR",
          locale_key: "fr-fr",
          language: undefined,
          country: undefined,
        },
        updatedAt: "2026-10-12T00:00:00.000Z",
      },
    ]);
  });

  it("reads a single translation_map body and last_edited", () => {
    expect(
      readTranslationEntries({
        translation_map: { id_0: "Hello" },
        locale: { uuid: "src" },
        last_edited: "2026-10-11T12:00:00.000Z",
      }),
    ).toEqual([
      {
        translation_map: { id_0: "Hello" },
        locale: {
          uuid: "src",
          name: undefined,
          locale_key: undefined,
          language: undefined,
          country: undefined,
        },
        updatedAt: "2026-10-11T12:00:00.000Z",
      },
    ]);
  });

  it("drops non-object entries", () => {
    expect(readTranslationEntries({ translations: [null, "nope", 3] })).toEqual([]);
    expect(readTranslationEntries(null)).toEqual([]);
  });
});
