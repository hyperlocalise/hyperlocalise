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

import { productFooterLinks, productPagesBySlug, productSlugs } from "./product-page-content";
import { productPageMessages } from "./product-page-content.messages";

describe("product page content", () => {
  it("includes a marketing page for every product pillar", () => {
    expect(productSlugs).toEqual([
      "agents-automation",
      "multilingual-content-studio",
      "domains",
      "hyperlab",
      "guidelines",
    ]);
  });

  it("exposes footer links for Domains and Hyperlab", () => {
    expect(productFooterLinks.map((link) => link.href)).toEqual([
      "/product/agents-automation",
      "/product/multilingual-content-studio",
      "/product/domains",
      "/product/hyperlab",
      "/product/guidelines",
    ]);
  });
});

describe("agents automation product copy", () => {
  it("names the product as a workflow for multilingual content operations", () => {
    const page = productPagesBySlug["agents-automation"];

    expect(productPageMessages[page.hero.headlineKey].defaultMessage).toBe(
      "The workflow for multilingual content operations.",
    );
    expect(productPageMessages[page.hero.subcopyKey].defaultMessage).toBe(
      "Connect Slack, Notion, Contentful, and GitHub. Draft, review, and publish in every language.",
    );
    expect(page.metadata.keywords).toEqual([
      "multilingual content operations",
      "multilingual content automation",
      "campaign workflow automation",
      "CMS content automation",
    ]);
    expect(productPageMessages[page.detailsHeadlineKey].defaultMessage).toBe(
      "Build it once. Every language follows it.",
    );
    expect(productPageMessages[page.proofPoints[0]!.titleKey].defaultMessage).toBe(
      "Create the workflow",
    );
    expect(productPageMessages[page.proofPoints[1]!.titleKey].defaultMessage).toBe(
      "It runs in every language",
    );
    expect(productPageMessages[page.proofPoints[2]!.titleKey].defaultMessage).toBe(
      "It lands back in your tools",
    );
    expect(productPageMessages[page.cta.headlineKey].defaultMessage).toBe(
      "Set up the workflow. Watch the next campaign follow it.",
    );
  });
});
