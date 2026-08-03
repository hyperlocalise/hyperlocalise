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

import { buildNativeGlossaryTsQuery } from "./build-native-glossary-tsquery";

describe("buildNativeGlossaryTsQuery", () => {
  it("strips apostrophes, quotes, and hyphens before building prefix terms", () => {
    expect(buildNativeGlossaryTsQuery("What's new")).toBe("What:* & s:* & new:*");
    expect(buildNativeGlossaryTsQuery(`"Talk to Heidi"`)).toBe("Talk:* & to:* & Heidi:*");
    expect(buildNativeGlossaryTsQuery("multi-word term")).toBe("multi:* & word:* & term:*");
  });

  it("returns an empty string when input is only punctuation", () => {
    expect(buildNativeGlossaryTsQuery("!!!")).toBe("");
    expect(buildNativeGlossaryTsQuery("'-\"")).toBe("");
  });

  it("caps terms at 50 to match concordance search", () => {
    const words = Array.from({ length: 60 }, (_, index) => `term${index}`);
    const tsQuery = buildNativeGlossaryTsQuery(words.join(" "));
    expect(tsQuery.split(" & ")).toHaveLength(50);
    expect(tsQuery.startsWith("term0:*")).toBe(true);
    expect(tsQuery.endsWith("term49:*")).toBe(true);
  });
});
