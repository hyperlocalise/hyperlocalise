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

import { toCatTmSegmentFromCrowdin } from "./content-editor-external-tm-segment";

describe("toCatTmSegmentFromCrowdin", () => {
  it("marks the source-language record and keeps other locales", () => {
    const mapped = toCatTmSegmentFromCrowdin(
      {
        id: 9,
        records: [
          { id: 1, languageId: "en", text: "Good morning." },
          { id: 2, languageId: "de", text: "Guten Morgen." },
          { id: 3, languageId: "ja", text: "おはようございます。" },
        ],
      },
      "en",
    );

    expect(mapped?.source).toEqual({
      id: "1",
      locale: "en",
      text: "Good morning.",
      isSource: true,
    });
    expect(mapped?.records).toEqual([
      { id: "1", locale: "en", text: "Good morning.", isSource: true },
      { id: "2", locale: "de", text: "Guten Morgen.", isSource: false },
      { id: "3", locale: "ja", text: "おはようございます。", isSource: false },
    ]);
  });

  it("returns null for an empty Crowdin segment", () => {
    expect(toCatTmSegmentFromCrowdin({ id: 1, records: [] }, "en")).toBeNull();
  });
});
