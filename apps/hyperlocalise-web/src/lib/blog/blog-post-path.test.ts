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

import { getBlogPostPath, isValidBlogPostSlug, normalizeBlogPostSlug } from "./blog-post-path";

describe("blog post slug validation", () => {
  it("accepts kebab-case slugs", () => {
    expect(isValidBlogPostSlug("designing-cat-review-with-visual-context")).toBe(true);
    expect(normalizeBlogPostSlug("sample-post.md")).toBe("sample-post");
  });

  it("rejects path traversal and unsafe characters", () => {
    expect(isValidBlogPostSlug("../secrets")).toBe(false);
    expect(isValidBlogPostSlug("post<script>")).toBe(false);
    expect(normalizeBlogPostSlug('"><img src=x onerror=alert(1)>')).toBeNull();
  });
});

describe("getBlogPostPath", () => {
  it("builds a safe blog post path", () => {
    expect(getBlogPostPath("en", "sample-post")).toBe("/en/blog/sample-post");
  });

  it("returns null for unsafe slugs", () => {
    expect(getBlogPostPath("en", "../secrets")).toBeNull();
  });
});
