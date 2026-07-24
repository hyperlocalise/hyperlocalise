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
import { productFooterLinks } from "@/components/marketing/product/product-page-content";
import { useCaseFooterLinks } from "@/components/marketing/use-case/use-case-page-content";

export const githubRepoUrl = "https://github.com/hyperlocalise/hyperlocalise";
export const githubActionUrl = "https://github.com/marketplace/actions/hyperlocalise-ci";
export const githubReleasesUrl = "https://github.com/hyperlocalise/hyperlocalise/releases";
export const docsUrl = "https://hyperlocalise.dev";
export const cliDocsUrl = "https://hyperlocalise.dev/commands/overview";
export const contactUrl = "mailto:minh@hyperlocalise.com";
export const linkedInCompanyUrl = "https://www.linkedin.com/company/hyperlocalise/";

export type MarketingFooterLink = {
  labelKey?: string;
  useCaseLabelKey?: import("@/components/marketing/use-case/use-case-page-content.messages").UseCaseMessageKey;
  productLabelKey?: import("@/components/marketing/product/product-page-content.messages").ProductMessageKey;
  label?: string;
  href: string;
};

export type MarketingFooterColumn = {
  titleKey?: string;
  title?: string;
  links: MarketingFooterLink[];
  nested?: {
    title: string;
    links: MarketingFooterLink[];
  };
};

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
    links: productFooterLinks,
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
      { label: "Blog", href: "/en/blog" },
      { labelKey: "footerGitHubAction", href: githubActionUrl },
      { labelKey: "footerContact", href: contactUrl },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/en/terms" },
      { label: "Privacy", href: "/en/privacy" },
      { label: "Trust Center", href: "/en/trust-center" },
    ],
    nested: {
      title: "Social",
      links: [{ label: "LinkedIn", href: linkedInCompanyUrl }],
    },
  },
];
