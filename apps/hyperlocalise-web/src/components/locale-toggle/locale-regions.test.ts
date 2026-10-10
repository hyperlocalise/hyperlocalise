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

import { buildLocalePickerEntries, groupLocalePickerEntries } from "./locale-regions";

const entries = buildLocalePickerEntries("en");

function localesFor(query: string) {
  return groupLocalePickerEntries(entries, query).flatMap((group) =>
    group.entries.map((entry) => entry.locale),
  );
}

describe("groupLocalePickerEntries", () => {
  it("groups every locale by region in display order when the query is empty", () => {
    expect(
      groupLocalePickerEntries(entries, "  ").map(({ group, entries: groupEntries }) => [
        group,
        groupEntries.map((entry) => entry.locale),
      ]),
    ).toEqual([
      ["americas", ["en"]],
      ["asia-pacific", ["zh-CN", "fil-PH", "ja-JP", "ko-KR", "th-TH", "vi-VN"]],
      ["europe", ["da-DK", "nl-NL", "fr-FR", "de-DE"]],
    ]);
  });

  it("matches native names without diacritics", () => {
    expect(localesFor("tieng viet")).toEqual(["vi-VN"]);
  });

  it("matches names in the reader's language and native script", () => {
    expect(localesFor("germany")).toEqual(["de-DE"]);
    expect(localesFor("中国")).toEqual(["zh-CN"]);
  });

  it("drops regions with no matches", () => {
    expect(groupLocalePickerEntries(entries, "francais").map(({ group }) => group)).toEqual([
      "europe",
    ]);
    expect(groupLocalePickerEntries(entries, "klingon")).toEqual([]);
  });
});
