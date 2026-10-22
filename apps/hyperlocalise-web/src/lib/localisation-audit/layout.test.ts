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

import { parseAuditPageLayout } from "./layout";

describe("parseAuditPageLayout", () => {
  it("keeps well-formed measurements and trims oversized text", () => {
    const layout = parseAuditPageLayout({
      viewports: [
        {
          width: 390,
          horizontalOverflowPx: 12,
          clippedText: [{ tag: "button", text: `  ${"x".repeat(300)}  ` }],
          offscreen: [],
        },
      ],
    });

    expect(layout?.viewports[0]?.horizontalOverflowPx).toBe(12);
    expect(layout?.viewports[0]?.clippedText[0]?.text).toHaveLength(120);
  });

  it("caps element lists", () => {
    const layout = parseAuditPageLayout({
      viewports: [
        {
          width: 1440,
          horizontalOverflowPx: 0,
          clippedText: Array.from({ length: 40 }, () => ({ tag: "a", text: "Link" })),
          offscreen: [],
        },
      ],
    });

    expect(layout?.viewports[0]?.clippedText).toHaveLength(12);
  });

  it("rejects malformed or empty measurements", () => {
    expect(parseAuditPageLayout(undefined)).toBeNull();
    expect(parseAuditPageLayout({ viewports: [] })).toBeNull();
    expect(parseAuditPageLayout({ viewports: [{ width: "wide" }] })).toBeNull();
  });
});
