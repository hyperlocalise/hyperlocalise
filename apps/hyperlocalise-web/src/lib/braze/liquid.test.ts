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

import { protectBrazeLiquid, restoreBrazeLiquid } from "./liquid";

describe("braze liquid", () => {
  it("protects Liquid as HTML comments and restores it", () => {
    const source = "Hello {{${first_name}}} {% if x %}yes{% endif %}";
    const protectedText = protectBrazeLiquid(source);
    expect(protectedText.text).toContain("<!--HL_BRAZE_LIQUID_0-->");
    expect(protectedText.text).not.toContain("{{");
    expect(restoreBrazeLiquid(protectedText.text, protectedText.tokens)).toBe(source);
  });
});
