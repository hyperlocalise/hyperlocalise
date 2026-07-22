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
