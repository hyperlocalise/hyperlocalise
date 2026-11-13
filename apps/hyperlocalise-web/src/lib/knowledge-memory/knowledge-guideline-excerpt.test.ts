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

import { excerptGuidelineText } from "./knowledge-guideline-excerpt";

describe("excerptGuidelineText", () => {
  it("returns empty string for blank content", () => {
    expect(excerptGuidelineText("   \n  ")).toBe("");
  });

  it("collapses whitespace and truncates long text", () => {
    const long = "word ".repeat(40);
    const excerpt = excerptGuidelineText(long, 20);
    expect(excerpt.length).toBeLessThanOrEqual(20);
    expect(excerpt.endsWith("…")).toBe(true);
  });
});
