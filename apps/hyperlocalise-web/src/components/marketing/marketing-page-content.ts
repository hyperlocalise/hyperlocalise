import { useCaseFooterLinks } from "@/components/marketing/use-case";
import { productLinks } from "@/components/marketing/product/product-page-content";

export const githubRepoUrl = "https://github.com/hyperlocalise/hyperlocalise";
export const githubActionUrl = "https://github.com/marketplace/actions/hyperlocalise-ci";
export const githubReleasesUrl = "https://github.com/hyperlocalise/hyperlocalise/releases";
export const docsUrl = "https://hyperlocalise.dev";
export const cliDocsUrl = "https://hyperlocalise.dev/commands/overview";

export type MarketingFooterLink = {
  labelKey?: string;
  label?: string;
  href: string;
};

export type MarketingFooterColumn = {
  titleKey?: string;
  title?: string;
  links: MarketingFooterLink[];
};

export const principles = [
  {
    titleKey: "principleAgentNativeTitle",
    descriptionKey: "principleAgentNativeDescription",
  },
  {
    titleKey: "principleBringYourLlmsTitle",
    descriptionKey: "principleBringYourLlmsDescription",
  },
  {
    titleKey: "principleReleaseConfidenceTitle",
    descriptionKey: "principleReleaseConfidenceDescription",
  },
] as const;

export const chapters = [
  {
    id: "01",
    anchorId: "sources",
    labelKey: "chapter01Label",
    titleKey: "chapter01Title",
    descriptionKey: "chapter01Description",
    linkKeys: [
      "chapter01LinkGitHubChanges",
      "chapter01LinkSlackRequests",
      "chapter01LinkClaudeBriefs",
      "chapter01LinkContextAttached",
    ],
    cta: {
      labelKey: "viewGitHubAction",
      href: githubActionUrl,
    },
    placeholderType: "product",
    placeholderTitleKey: "chapter01PlaceholderTitle",
    placeholderDescriptionKey: "chapter01PlaceholderDescription",
  },
  {
    id: "02",
    anchorId: "translate-task",
    labelKey: "chapter02Label",
    titleKey: "chapter02Title",
    descriptionKey: "chapter02Description",
    linkKeys: [
      "chapter02LinkAiTranslationReview",
      "chapter02LinkTmsAgnostic",
      "chapter02LinkRegressionEvals",
      "chapter02LinkContextAutoDiscovery",
    ],
  },
  {
    id: "03",
    anchorId: "providers",
    labelKey: "chapter03Label",
    titleKey: "chapter03Title",
    descriptionKey: "chapter03Description",
    linkKeys: [
      "chapter03LinkLlmAgnostic",
      "chapter03LinkTmsAgnostic",
      "chapter03LinkProviderSwitching",
      "chapter03LinkWorkflowContinuity",
    ],
    placeholderType: "illustration",
    placeholderTitleKey: "chapter03PlaceholderTitle",
    placeholderDescriptionKey: "chapter03PlaceholderDescription",
  },
  {
    id: "04",
    anchorId: "evaluations",
    labelKey: "chapter04Label",
    titleKey: "chapter04Title",
    descriptionKey: "chapter04Description",
    linkKeys: [
      "chapter04LinkDriftChecks",
      "chapter04LinkEvalGates",
      "chapter04LinkPrVisibility",
      "chapter04LinkReleaseBlocking",
    ],
    cta: {
      labelKey: "viewGitHubAction",
      href: githubActionUrl,
    },
    placeholderType: "illustration",
    placeholderTitleKey: "chapter04PlaceholderTitle",
    placeholderDescriptionKey: "chapter04PlaceholderDescription",
  },
  {
    id: "05",
    anchorId: "monitor",
    labelKey: "chapter05Label",
    titleKey: "chapter05Title",
    descriptionKey: "chapter05Description",
    linkKeys: [
      "chapter05LinkLocaleHealth",
      "chapter05LinkEvalHistory",
      "chapter05LinkReviewCoverage",
      "chapter05LinkReleaseReadiness",
    ],
    placeholderType: "product",
    placeholderTitleKey: "chapter05PlaceholderTitle",
    placeholderDescriptionKey: "chapter05PlaceholderDescription",
  },
] as const;

export type MarketingChapter = (typeof chapters)[number];

export const testimonials = [
  {
    quoteKey: "testimonial0Quote",
    nameKey: "testimonial0Name",
    companyKey: "testimonial0Company",
    tone: "bg-[#dfe6ff] text-slate-950",
  },
  {
    quoteKey: "testimonial1Quote",
    nameKey: "testimonial1Name",
    companyKey: "testimonial1Company",
    tone: "bg-[#f4ff1e] text-slate-950",
  },
  {
    quoteKey: "testimonial2Quote",
    nameKey: "testimonial2Name",
    companyKey: "testimonial2Company",
    tone: "bg-[#2b87e8] text-slate-950",
  },
] as const;

export const footerColumns: MarketingFooterColumn[] = [
  {
    titleKey: "footerProductTitle",
    links: productLinks,
  },
  {
    titleKey: "footerUseCasesTitle",
    links: useCaseFooterLinks,
  },
  {
    titleKey: "footerResourcesTitle",
    links: [
      { labelKey: "footerDocumentation", href: docsUrl },
      { labelKey: "footerCliDocs", href: cliDocsUrl },
      { labelKey: "footerGitHubAction", href: githubActionUrl },
      { labelKey: "footerGitHub", href: githubRepoUrl },
      { labelKey: "footerContact", href: "mailto:minh@hyperlocalise.com" },
    ],
  },
];
