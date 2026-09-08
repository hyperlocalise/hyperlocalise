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
import type { ProductMessageKey } from "./product-page-content.messages";

export type { ProductMessageKey } from "./product-page-content.messages";

export type ProductPageSlug = "agents-automation" | "multilingual-content-studio" | "guidelines";

export type ProductVisualKind = "automation" | "cat" | "knowledge";

export type ProductPageLink = {
  labelKey: ProductMessageKey;
  href: string;
};

export type ProductPageContent = {
  slug: ProductPageSlug;
  metadata: {
    titleKey: ProductMessageKey;
    descriptionKey: ProductMessageKey;
    keywords: string[];
  };
  visualKind: ProductVisualKind;
  hero: {
    eyebrowKey: ProductMessageKey;
    headlineKey: ProductMessageKey;
    subcopyKey: ProductMessageKey;
  };
  detailsHeadlineKey: ProductMessageKey;
  summaryKey: ProductMessageKey;
  proofPoints: {
    titleKey: ProductMessageKey;
    bodyKey: ProductMessageKey;
  }[];
  cta: {
    headlineKey: ProductMessageKey;
    descriptionKey: ProductMessageKey;
  };
  related: ProductPageLink[];
};

export const productPages: ProductPageContent[] = [
  {
    slug: "agents-automation",
    metadata: {
      titleKey: "agentsAutomationMetadataTitle",
      descriptionKey: "agentsAutomationMetadataDescription",
      keywords: [
        "multilingual content operations",
        "multilingual content automation",
        "campaign workflow automation",
        "CMS content automation",
      ],
    },
    visualKind: "automation",
    hero: {
      eyebrowKey: "agentsAutomationHeroEyebrow",
      headlineKey: "agentsAutomationHeroHeadline",
      subcopyKey: "agentsAutomationHeroSubcopy",
    },
    detailsHeadlineKey: "agentsAutomationDetailsHeadline",
    summaryKey: "agentsAutomationSummary",
    proofPoints: [
      {
        titleKey: "agentsAutomationProof0Title",
        bodyKey: "agentsAutomationProof0Body",
      },
      {
        titleKey: "agentsAutomationProof1Title",
        bodyKey: "agentsAutomationProof1Body",
      },
      {
        titleKey: "agentsAutomationProof2Title",
        bodyKey: "agentsAutomationProof2Body",
      },
    ],
    cta: {
      headlineKey: "agentsAutomationCtaHeadline",
      descriptionKey: "agentsAutomationCtaDescription",
    },
    related: [
      { labelKey: "productNavContentStudio", href: "/product/multilingual-content-studio" },
      { labelKey: "productNavGuidelines", href: "/product/guidelines" },
    ],
  },
  {
    slug: "multilingual-content-studio",
    metadata: {
      titleKey: "contentStudioMetadataTitle",
      descriptionKey: "contentStudioMetadataDescription",
      keywords: [
        "multilingual content studio",
        "multilingual content creation",
        "AI content localisation",
        "multilingual campaign workflow",
      ],
    },
    visualKind: "cat",
    hero: {
      eyebrowKey: "contentStudioHeroEyebrow",
      headlineKey: "contentStudioHeroHeadline",
      subcopyKey: "contentStudioHeroSubcopy",
    },
    detailsHeadlineKey: "nextGenCatToolDetailsHeadline",
    summaryKey: "nextGenCatToolSummary",
    proofPoints: [
      {
        titleKey: "nextGenCatToolProof0Title",
        bodyKey: "nextGenCatToolProof0Body",
      },
      {
        titleKey: "nextGenCatToolProof1Title",
        bodyKey: "nextGenCatToolProof1Body",
      },
      {
        titleKey: "nextGenCatToolProof2Title",
        bodyKey: "nextGenCatToolProof2Body",
      },
    ],
    cta: {
      headlineKey: "nextGenCatToolCtaHeadline",
      descriptionKey: "nextGenCatToolCtaDescription",
    },
    related: [
      { labelKey: "productNavAgentsAutomation", href: "/product/agents-automation" },
      { labelKey: "productNavGuidelines", href: "/product/guidelines" },
    ],
  },
  {
    slug: "guidelines",
    metadata: {
      titleKey: "guidelinesMetadataTitle",
      descriptionKey: "guidelinesMetadataDescription",
      keywords: [
        "brand guidelines",
        "Google Drive",
        "Notion",
        "SharePoint",
        "compliance PDF",
        "market compliance",
      ],
    },
    visualKind: "knowledge",
    hero: {
      eyebrowKey: "guidelinesHeroEyebrow",
      headlineKey: "guidelinesHeroHeadline",
      subcopyKey: "guidelinesHeroSubcopy",
    },
    detailsHeadlineKey: "guidelinesDetailsHeadline",
    summaryKey: "guidelinesSummary",
    proofPoints: [
      {
        titleKey: "guidelinesProof0Title",
        bodyKey: "guidelinesProof0Body",
      },
      {
        titleKey: "guidelinesProof1Title",
        bodyKey: "guidelinesProof1Body",
      },
      {
        titleKey: "guidelinesProof2Title",
        bodyKey: "guidelinesProof2Body",
      },
    ],
    cta: {
      headlineKey: "guidelinesCtaHeadline",
      descriptionKey: "guidelinesCtaDescription",
    },
    related: [
      { labelKey: "productNavAgentsAutomation", href: "/product/agents-automation" },
      { labelKey: "productNavContentStudio", href: "/product/multilingual-content-studio" },
    ],
  },
];

export const productPagesBySlug = Object.fromEntries(
  productPages.map((page) => [page.slug, page]),
) as Record<ProductPageSlug, ProductPageContent>;

export const productSlugs = productPages.map((page) => page.slug);

export const productFooterLinks = productPages.map((page) => ({
  productLabelKey: page.hero.eyebrowKey,
  href: `/product/${page.slug}`,
}));
