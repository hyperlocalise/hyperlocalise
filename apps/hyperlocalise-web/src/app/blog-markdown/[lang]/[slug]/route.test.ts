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

function call(lang: string, slug: string) {
  return GET(new Request(`https://www.hyperlocalise.com/${lang}/blog/${slug}.md`), {
    params: Promise.resolve({ lang, slug }),
  });
}

describe("blog markdown route", () => {
  it("serves a post as Markdown with a canonical link to the HTML page", async () => {
    const [post] = getAllPosts("en");
    const response = await call("en", post.slug);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("Link")).toBe(
      `<https://www.hyperlocalise.com/en/blog/${post.slug}>; rel="canonical"`,
    );
    expect(body.startsWith("---\n")).toBe(true);
    expect(body).toContain(`# ${post.title}\n`);
    expect(body).toContain(`url: https://www.hyperlocalise.com/en/blog/${post.slug}\n`);
  });

  it("returns 404 for unknown posts and locales", async () => {
    expect((await call("en", "does-not-exist")).status).toBe(404);
    expect((await call("xx-XX", getAllPosts("en")[0].slug)).status).toBe(404);
  });
});
