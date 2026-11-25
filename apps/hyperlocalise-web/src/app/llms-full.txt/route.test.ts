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

import { getAllPosts } from "@/lib/blog/blog-post";

import { GET } from "./route";

describe("llms-full.txt route", () => {
  it("returns the full text of the curated pages as plain text", async () => {
    const response = GET();
    const body = await response.text();

    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(body.startsWith("# Hyperlocalise\n")).toBe(true);
    for (const heading of [
      "## Frequently asked questions",
      "## Product",
      "## Use cases",
      "## Integrations",
      "## Pricing",
      "## Blog",
    ]) {
      expect(body).toContain(`\n${heading}\n`);
    }
  });

  it("includes every English blog post with its canonical URL", async () => {
    const body = await GET().text();

    for (const post of getAllPosts("en")) {
      expect(body).toContain(`### ${post.title}`);
      expect(body).toContain(`URL: https://www.hyperlocalise.com/en/blog/${post.slug}\n`);
    }
  });

  it("keeps post headings below the document's own sections", async () => {
    const body = await GET().text();
    const blog = body.slice(body.indexOf("\n## Blog\n"));

    let inFence = false;
    const topLevelHeadings = blog.split("\n").filter((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return false;
      }
      return !inFence && /^##? /.test(line);
    });

    expect(topLevelHeadings).toEqual(["## Blog"]);
  });
});
