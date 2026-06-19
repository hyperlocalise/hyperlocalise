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
