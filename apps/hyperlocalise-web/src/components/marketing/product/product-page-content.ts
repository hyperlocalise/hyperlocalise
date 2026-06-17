import type { ProductMessageKey } from "./product-page-content.messages";

export type { ProductMessageKey } from "./product-page-content.messages";

export type ProductPageSlug = "agents-automation" | "next-gen-cat-tool" | "self-evolving-knowledge";

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
        "localisation automation",
        "AI localisation agents",
        "translation workflow automation",
        "TMS automation",
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
      { labelKey: "productNavNextGenCatTool", href: "/product/next-gen-cat-tool" },
      { labelKey: "productNavSelfEvolvingKnowledge", href: "/product/self-evolving-knowledge" },
    ],
  },
  {
    slug: "next-gen-cat-tool",
    metadata: {
      titleKey: "nextGenCatToolMetadataTitle",
      descriptionKey: "nextGenCatToolMetadataDescription",
      keywords: [
        "next-gen CAT tool",
        "AI assisted translation",
        "human in the loop translation",
        "localisation quality checks",
      ],
    },
    visualKind: "cat",
    hero: {
      eyebrowKey: "nextGenCatToolHeroEyebrow",
      headlineKey: "nextGenCatToolHeroHeadline",
      subcopyKey: "nextGenCatToolHeroSubcopy",
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
      { labelKey: "productNavSelfEvolvingKnowledge", href: "/product/self-evolving-knowledge" },
    ],
  },
  {
    slug: "self-evolving-knowledge",
    metadata: {
      titleKey: "selfEvolvingKnowledgeMetadataTitle",
      descriptionKey: "selfEvolvingKnowledgeMetadataDescription",
      keywords: [
        "localisation knowledge",
        "translation memory",
        "localisation glossary",
        "AI translation context",
      ],
    },
    visualKind: "knowledge",
    hero: {
      eyebrowKey: "selfEvolvingKnowledgeHeroEyebrow",
      headlineKey: "selfEvolvingKnowledgeHeroHeadline",
      subcopyKey: "selfEvolvingKnowledgeHeroSubcopy",
    },
    detailsHeadlineKey: "selfEvolvingKnowledgeDetailsHeadline",
    summaryKey: "selfEvolvingKnowledgeSummary",
    proofPoints: [
      {
        titleKey: "selfEvolvingKnowledgeProof0Title",
        bodyKey: "selfEvolvingKnowledgeProof0Body",
      },
      {
        titleKey: "selfEvolvingKnowledgeProof1Title",
        bodyKey: "selfEvolvingKnowledgeProof1Body",
      },
      {
        titleKey: "selfEvolvingKnowledgeProof2Title",
        bodyKey: "selfEvolvingKnowledgeProof2Body",
      },
    ],
    cta: {
      headlineKey: "selfEvolvingKnowledgeCtaHeadline",
      descriptionKey: "selfEvolvingKnowledgeCtaDescription",
    },
    related: [
      { labelKey: "productNavAgentsAutomation", href: "/product/agents-automation" },
      { labelKey: "productNavNextGenCatTool", href: "/product/next-gen-cat-tool" },
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
