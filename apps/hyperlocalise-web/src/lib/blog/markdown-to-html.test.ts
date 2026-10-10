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

  it("prefixes root-relative marketing links with the active locale", async () => {
    const html = await markdownToHtml(
      "Read [this post](/blog/sample) and [product localisation](/use-cases/product-localisation).",
      { locale: "en" },
    );

    expect(html).toContain('href="/en/blog/sample"');
    expect(html).toContain('href="/en/use-cases/product-localisation"');
    expect(html).not.toContain('href="/blog/sample"');
  });

  it("leaves external and hash-only links unchanged", async () => {
    const html = await markdownToHtml(
      "[Calendar](https://calendar.app.google/example) and [section](#intro)",
      { locale: "en" },
    );

    expect(html).toContain('href="https://calendar.app.google/example"');
    expect(html).toContain('href="#intro"');
  });

  it("renders GFM tables used by buyer-guide posts", async () => {
    const html = await markdownToHtml(
      "| Criterion | Question |\n| --- | --- |\n| Product-context awareness | What is this string for? |\n",
    );

    expect(html).toContain("<table");
    expect(html).toContain("Product-context awareness");
    expect(html).toContain("What is this string for?");
  });
});
