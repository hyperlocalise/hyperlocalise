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

import { productSlugs } from "@/components/marketing/product/product-page-content";

import { buildProductJsonLd } from "./build-product-json-ld";

describe("buildProductJsonLd", () => {
  it("emits one SoftwareApplication block per product slug", () => {
    for (const slug of productSlugs) {
      const jsonLd = buildProductJsonLd(slug, "en");

      expect(jsonLd).toMatchObject({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        inLanguage: "en",
        url: `https://www.hyperlocalise.com/en/product/${slug}`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Cloud",
        provider: {
          "@type": "Organization",
          name: "Hyperlocalise",
          url: "https://www.hyperlocalise.com",
        },
      });
      expect(jsonLd.name).toBeTruthy();
      expect(jsonLd.description).toBeTruthy();
      expect(jsonLd.featureList).toEqual(expect.arrayContaining([expect.any(String)]));
      expect((jsonLd.featureList as string[]).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("matches the agents automation H1 and meta description", () => {
    const jsonLd = buildProductJsonLd("agents-automation", "en");

    expect(jsonLd).toMatchObject({
      name: "The workflow for multilingual content operations.",
      description:
        "Connect Slack, Notion, Contentful, and GitHub. Draft, review, and publish in every language from one workflow.",
      featureList: [
        "Create the workflow",
        "It runs in every language",
        "It lands back in your tools",
      ],
    });
  });

  it("normalizes multiline headlines for schema text fields", () => {
    const jsonLd = buildProductJsonLd("domains", "en");

    expect(jsonLd.name).toBe("Publish once. Get found everywhere.");
  });
});
