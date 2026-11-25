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

import { buildBreadcrumbJsonLd, stripBrandTitleSuffix } from "./breadcrumb-json-ld";

describe("buildBreadcrumbJsonLd", () => {
  it("roots the trail at the localized homepage", () => {
    const jsonLd = buildBreadcrumbJsonLd("fr-FR", [
      { name: "Blog", path: "/blog" },
      { name: "Post", path: "/blog/post" },
    ]);

    expect(jsonLd.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Hyperlocalise",
        item: "https://www.hyperlocalise.com/fr-FR",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: "https://www.hyperlocalise.com/fr-FR/blog",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Post",
        item: "https://www.hyperlocalise.com/fr-FR/blog/post",
      },
    ]);
  });
});

describe("stripBrandTitleSuffix", () => {
  it("removes the brand suffix from page titles", () => {
    expect(stripBrandTitleSuffix("Blog | Hyperlocalise")).toBe("Blog");
    expect(stripBrandTitleSuffix("Pricing")).toBe("Pricing");
  });
});
