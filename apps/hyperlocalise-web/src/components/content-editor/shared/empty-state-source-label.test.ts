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

import { emptyStateSourceLabel } from "./empty-state-source-label";

const md0 = "\u001eHLMDPH_8E6DFE8F53EA_0\u001f";

describe("emptyStateSourceLabel", () => {
  it("returns null when the source is blank", () => {
    expect(emptyStateSourceLabel("  \n")).toBeNull();
    expect(emptyStateSourceLabel(null)).toBeNull();
  });

  it("collapses whitespace and keeps a short source intact", () => {
    expect(emptyStateSourceLabel("  Save\nchanges  ")).toBe("Save changes");
  });

  it("formats internal markup sentinels before quoting the source", () => {
    expect(emptyStateSourceLabel(`Click ${md0}here`)).toBe("Click MD#0here");
  });

  it("truncates a long source without a trailing space before the ellipsis", () => {
    const source = "word ".repeat(30);
    const label = emptyStateSourceLabel(source);
    expect(label).toHaveLength(80);
    expect(label?.endsWith("…")).toBe(true);
    expect(label?.endsWith(" …")).toBe(false);
  });

  it("truncates on grapheme boundaries instead of splitting surrogate pairs", () => {
    const source = `${"a".repeat(78)}👍 more source`;
    expect(emptyStateSourceLabel(source)).toBe(`${"a".repeat(78)}👍…`);
  });
});
