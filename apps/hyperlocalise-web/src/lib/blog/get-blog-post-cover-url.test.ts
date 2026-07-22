/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import type { Post } from "./blog-post";
import { getBlogPostCoverAbsoluteUrl, getBlogPostCoverUrl } from "./get-blog-post-cover-url";

const samplePost: Post = {
  slug: "sample-post",
  title: "Sample post",
  excerpt: "Sample excerpt",
  date: "2026-06-01T00:00:00.000Z",
  category: "Blog",
  content: "Sample content",
};

describe("getBlogPostCoverUrl", () => {
  it("returns the static cover image when provided", () => {
    const post = {
      ...samplePost,
      coverImage: "/images/blog/example.jpg",
    };

    expect(getBlogPostCoverUrl(post, "en")).toBe("/images/blog/example.jpg");
  });

  it("falls back to the validated blog OG image API when coverImage is missing", () => {
    expect(getBlogPostCoverUrl(samplePost, "en")).toBe("/api/blog/sample-post/og-image?lang=en");
  });
});

describe("getBlogPostCoverAbsoluteUrl", () => {
  it("returns an absolute URL for dynamic covers", () => {
    expect(getBlogPostCoverAbsoluteUrl(samplePost, "en", "https://www.hyperlocalise.com")).toBe(
      "https://www.hyperlocalise.com/api/blog/sample-post/og-image?lang=en",
    );
  });
});
