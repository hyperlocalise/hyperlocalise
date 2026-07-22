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

import { markdownToHtml } from "./markdown-to-html";

describe("markdownToHtml", () => {
  it("renders markdown without executing raw html", async () => {
    const html = await markdownToHtml("# Title\n\n<script>alert(1)</script>\n\nHello");

    expect(html).not.toContain("<script");
    expect(html).toContain("Hello");
  });

  it("strips inline event handlers", async () => {
    const html = await markdownToHtml('<img src="x" onerror="alert(1)">');

    expect(html).not.toContain("onerror");
  });
});
