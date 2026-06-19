import { describe, expect, it } from "vite-plus/test";

import { getBlogPostOgImagePath } from "./blog-post-og-image-path";

describe("getBlogPostOgImagePath", () => {
  it("builds a validated API path with locale", () => {
    expect(getBlogPostOgImagePath("en", "what-is-translation-intelligence")).toBe(
      "/api/blog/what-is-translation-intelligence/og-image?lang=en",
    );
  });

  it("rejects unsafe slugs", () => {
    expect(getBlogPostOgImagePath("en", "../secrets")).toBeNull();
    expect(getBlogPostOgImagePath("en", '"><img src=x onerror=alert(1)>')).toBeNull();
  });
});
