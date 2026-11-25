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
import { getLocalisationAuditRouteMetadata } from "@/app/[lang]/(marketing)/localisation-audit/localisation-audit-route-metadata";
import { getProductRouteMetadata } from "@/app/[lang]/(marketing)/product/[slug]/product-route-metadata";
import { getStartupsRouteMetadata } from "@/app/[lang]/(marketing)/startups/startups-route-metadata";
import { getUseCaseRouteMetadata } from "@/app/[lang]/(marketing)/use-cases/[slug]/use-case-route-metadata";
import {
  getHomepageFaqItems,
  type HomepageFaqItem,
} from "@/components/marketing/homepage-faq-content";
import { getMarketingIntegrations } from "@/components/marketing/integrations/integrations-page-content";
import { getIrisFaqItems } from "@/components/marketing/iris/iris-faq-content";
import { getLocalisationAuditFaqItems } from "@/components/marketing/localisation-audit/localisation-audit-faq-content";
import { getPricingFaqItems } from "@/components/marketing/pricing/pricing-faq-content";
import { getPricingPlans } from "@/components/marketing/pricing/pricing-page-content";
import { getAgentsAutomationFaqItems } from "@/components/marketing/product/agents-automation-faq-content";
import {
  productSlugs,
  type ProductPageSlug,
} from "@/components/marketing/product/product-page-content";
import { getUseCaseFaqItems } from "@/components/marketing/use-case/faq/use-case-faq-content";
import type { UseCaseFaqSlug } from "@/components/marketing/use-case/faq/use-case-faq-types";
import { useCaseSlugs } from "@/components/marketing/use-case/use-case-page-content";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { DEFAULT_APP_LOCALE } from "@/lib/app-i18n/locales";
import { getAllPosts, type Post } from "@/lib/blog/blog-post";
import { getBlogPostMarkdownUrl } from "@/lib/blog/blog-post-markdown";
import { stripBrandTitleSuffix } from "@/lib/seo/breadcrumb-json-ld";
import { SITE_URL } from "@/lib/seo/site-url";

/** llms.txt is an English index; localized pages are linked from each page's hreflang. */
const LLMS_LOCALE = DEFAULT_APP_LOCALE;

/** Short product names. Page titles are taglines, which make poor link text. */
const PRODUCT_NAMES: Record<ProductPageSlug, string> = {
  "agents-automation": "Agent Automation",
  "multilingual-content-studio": "Multilingual Content Studio",
  guidelines: "Guidelines",
  domains: "Domains",
  hyperlab: "Hyperlab",
};

type LlmsLink = {
  title: string;
  href: string;
  description: string;
};

type LlmsSection = {
  slug: string;
  title: string;
  href: string;
  description: string;
};

const SUMMARY =
  "Hyperlocalise is the best agentic localisation platform — an AI workforce that helps teams launch globally in days, built so localisation managers can thrive.";

const INTRO = `Hyperlocalise gives localisation teams an AI workforce that understands market nuance, then translates, reviews, and syncs product copy with real context. Instead of chasing strings across tools, localisation managers assign agents to the work, keep human review first-class, and ship multilingual launches with confidence.

The product experience is designed for localisation managers who need control without busywork: clear workflows, trustworthy context, and review loops that scale with every release. Hyperlocalise combines agent automation, a next-gen CAT workspace, and shared guidelines so every launch starts with product meaning, glossary decisions, and reviewer intent already attached. Stay flexible across LLM providers and TMS platforms while keeping localisation quality under control.`;

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function withoutTrailingPeriod(value: string): string {
  return oneLine(value).replace(/\.+$/, "");
}

function pageUrl(path: string): string {
  return `${SITE_URL}/${LLMS_LOCALE}${path}`;
}

function formatLinks(links: readonly LlmsLink[]): string {
  return links
    .map((link) => `- [${link.title}](${link.href}): ${withoutTrailingPeriod(link.description)}.`)
    .join("\n");
}

function formatFaq(items: readonly HomepageFaqItem[]): string {
  return items.map((item) => `**${oneLine(item.question)}**\n\n${item.answer.trim()}`).join("\n\n");
}

function getProductSections(): LlmsSection[] {
  const intl = getIntlShape(LLMS_LOCALE);

  return productSlugs.flatMap((slug) => {
    const metadata = getProductRouteMetadata(slug, intl);
    if (!metadata) {
      return [];
    }

    return [
      {
        slug,
        title: PRODUCT_NAMES[slug],
        href: pageUrl(`/product/${slug}`),
        description: metadata.description,
      },
    ];
  });
}

function getUseCaseSections(): LlmsSection[] {
  const intl = getIntlShape(LLMS_LOCALE);

  return useCaseSlugs.flatMap((slug) => {
    const metadata = getUseCaseRouteMetadata(slug, intl);
    if (!metadata) {
      return [];
    }

    return [
      {
        slug,
        title: stripBrandTitleSuffix(metadata.title),
        href: pageUrl(`/use-cases/${slug}`),
        description: metadata.description,
      },
    ];
  });
}

function getIntegrationLinks(): LlmsLink[] {
  return getMarketingIntegrations(LLMS_LOCALE).map((integration) => ({
    title: integration.name,
    href: pageUrl(`/integrations/${integration.slug}`),
    description: integration.tagline,
  }));
}

function getBlogPosts(): Post[] {
  return getAllPosts(LLMS_LOCALE);
}

function getBlogLinks(posts: readonly Post[]): LlmsLink[] {
  return posts.map((post) => ({
    title: post.title,
    href: getBlogPostMarkdownUrl(LLMS_LOCALE, post.slug),
    description: post.excerpt,
  }));
}

const DOCS_LINKS: LlmsLink[] = [
  {
    title: "Documentation",
    href: "https://hyperlocalise.dev",
    description: "Product docs and guides for Hyperlocalise",
  },
  {
    title: "CLI overview",
    href: "https://hyperlocalise.dev/cli/commands/overview",
    description: "CLI commands for automation and CI workflows",
  },
];

function getCompanyLinks(): LlmsLink[] {
  const intl = getIntlShape(LLMS_LOCALE);

  return [
    {
      title: "Homepage",
      href: pageUrl(""),
      description: "Marketing homepage for the agentic localisation platform",
    },
    {
      title: "Pricing",
      href: pageUrl("/pricing"),
      description:
        "Compare Free, Starter, Growth, and Enterprise plans for Hyperlocalise — agentic localisation for teams shipping global product content",
    },
    {
      title: "Company",
      href: pageUrl("/company"),
      description:
        "Meet the Hyperlocalise founders and our mission: an AI workforce that acts like your team of local experts",
    },
    {
      title: "Blog",
      href: pageUrl("/blog"),
      description: "Product updates and writing on localisation operations",
    },
    {
      title: "Iris",
      href: pageUrl("/iris"),
      description:
        "Iris is Hyperlocalise's AI localisation engine for multilingual assets. It creates and localises images, video, motion, and audio for every language",
    },
    {
      title: "Localisation audit",
      href: pageUrl("/localisation-audit"),
      description: getLocalisationAuditRouteMetadata(intl).description,
    },
    {
      title: "Startups",
      href: pageUrl("/startups"),
      description: getStartupsRouteMetadata(intl).description,
    },
    {
      title: "Trust Center",
      href: "https://app.aus.vanta.com/hyperlocalise.com/trust/su9x7fcjfa8q700wu9pt2u",
      description: "Security, privacy, and subprocessors",
    },
    { title: "Privacy", href: pageUrl("/privacy"), description: "Privacy policy" },
    { title: "Terms", href: pageUrl("/terms"), description: "Cloud Service Agreement terms" },
    { title: "Contact", href: pageUrl("/contact"), description: "Reach the Hyperlocalise team" },
  ];
}

function agentRegistrationSection(authkitConfigured: boolean): string {
  if (!authkitConfigured) {
    return "";
  }

  return `## Agents

- [Agent registration](${SITE_URL}/auth.md): Follow this skill to register a coding agent with AuthKit, complete the hosted claim, and use the JWT on MCP and /api/v1.

`;
}

export type BuildLlmsTxtOptions = {
  /** Whether the AuthKit agent registration skill is served at `/auth.md`. */
  authkitConfigured: boolean;
};

/** The `/llms.txt` index: one curated link per page, built from the same sources as the sitemap. */
export function buildLlmsTxt({ authkitConfigured }: BuildLlmsTxtOptions): string {
  const productLinks = getProductSections();
  const useCaseLinks = getUseCaseSections();

  return `# Hyperlocalise

> ${SUMMARY}

${INTRO}

Use the pages below as the canonical overview of Hyperlocalise. Prefer these curated links over crawling the full site. The full text of these pages is at ${SITE_URL}/llms-full.txt.

${agentRegistrationSection(authkitConfigured)}## Product

${formatLinks(productLinks)}

## Use cases

${formatLinks(useCaseLinks)}

## Integrations

${formatLinks(getIntegrationLinks())}

## Docs

${formatLinks(DOCS_LINKS)}

## Blog

${formatLinks(getBlogLinks(getBlogPosts()))}

## Company

${formatLinks(getCompanyLinks())}

## Optional

- [Full content](${SITE_URL}/llms-full.txt): Every page above as one Markdown document.
- [LinkedIn](https://www.linkedin.com/company/hyperlocalise/): Company page.
`;
}

/**
 * Shifts Markdown headings down so a post's `#`/`##` sit under the document's own sections.
 * Lines inside fenced code blocks are left alone.
 */
export function demoteMarkdownHeadings(markdown: string, levels: number): string {
  let inFence = false;

  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }

      if (inFence) {
        return line;
      }

      const heading = /^(#{1,6})(\s+.*)$/.exec(line);
      if (!heading) {
        return line;
      }

      const depth = Math.min(6, heading[1].length + levels);
      return `${"#".repeat(depth)}${heading[2]}`;
    })
    .join("\n");
}

function formatSectionHeader(section: LlmsSection): string {
  return `### ${section.title}\n\nURL: ${section.href}\n\n${oneLine(section.description)}`;
}

function buildProductFull(): string {
  return getProductSections()
    .map((section) => {
      const header = formatSectionHeader(section);
      if (section.slug !== "agents-automation") {
        return header;
      }

      return `${header}\n\n${formatFaq(getAgentsAutomationFaqItems(LLMS_LOCALE))}`;
    })
    .join("\n\n");
}

function buildUseCasesFull(): string {
  return getUseCaseSections()
    .map((section) => {
      const faq = getUseCaseFaqItems(section.slug as UseCaseFaqSlug, LLMS_LOCALE);
      const header = formatSectionHeader(section);
      return faq.length > 0 ? `${header}\n\n${formatFaq(faq)}` : header;
    })
    .join("\n\n");
}

function buildIntegrationsFull(): string {
  return getMarketingIntegrations(LLMS_LOCALE)
    .map((integration) => {
      const parts = [
        `### ${integration.name}`,
        `URL: ${pageUrl(`/integrations/${integration.slug}`)}`,
        oneLine(integration.tagline),
        ...integration.overview.map((paragraph) => paragraph.trim()),
      ];

      if (integration.capabilities.length > 0) {
        parts.push(
          integration.capabilities
            .map(
              (capability) =>
                `- **${oneLine(capability.title)}**: ${oneLine(capability.description)}`,
            )
            .join("\n"),
        );
      }

      if (integration.setupSteps.length > 0) {
        parts.push(
          `How to set it up:\n\n${integration.setupSteps
            .map(
              (step, index) =>
                `${index + 1}. **${oneLine(step.title)}**: ${oneLine(step.description)}`,
            )
            .join("\n")}`,
        );
      }

      if (integration.faqs.length > 0) {
        parts.push(formatFaq(integration.faqs));
      }

      return parts.filter(Boolean).join("\n\n");
    })
    .join("\n\n");
}

function buildPricingFull(): string {
  const plans = getPricingPlans(LLMS_LOCALE)
    .map((plan) => {
      const price = [plan.price, plan.priceSuffix].filter(Boolean).join(" ");
      const features = plan.features.map((feature) => `- ${oneLine(feature)}`).join("\n");
      const includes = plan.includesFrom ? `${oneLine(plan.includesFrom)}\n\n` : "";
      return `### ${plan.name} — ${price}\n\n${oneLine(plan.description)}\n\n${includes}${features}`;
    })
    .join("\n\n");

  return `URL: ${pageUrl("/pricing")}\n\n${plans}\n\n### Pricing FAQ\n\n${formatFaq(getPricingFaqItems(LLMS_LOCALE))}`;
}

function buildBlogFull(posts: readonly Post[]): string {
  return posts
    .map((post) => {
      const published = post.date.slice(0, 10);
      const updated = post.updated ? `\nUpdated: ${post.updated.slice(0, 10)}` : "";
      return `### ${post.title}

URL: ${pageUrl(`/blog/${post.slug}`)}
Published: ${published}${updated}

${oneLine(post.excerpt)}

${demoteMarkdownHeadings(post.content.trim(), 3)}`;
    })
    .join("\n\n---\n\n");
}

/** The `/llms-full.txt` document: the text of every page `/llms.txt` links to, in one file. */
export function buildLlmsFullTxt(): string {
  return `# Hyperlocalise

> ${SUMMARY}

${INTRO}

This document holds the full text of the pages listed at ${SITE_URL}/llms.txt, in English. Each section links to its canonical page.

## Frequently asked questions

${formatFaq(getHomepageFaqItems(LLMS_LOCALE))}

## Product

${buildProductFull()}

## Use cases

${buildUseCasesFull()}

## Integrations

${buildIntegrationsFull()}

## Pricing

${buildPricingFull()}

## Iris

URL: ${pageUrl("/iris")}

${formatFaq(getIrisFaqItems(LLMS_LOCALE))}

## Localisation audit

URL: ${pageUrl("/localisation-audit")}

${formatFaq(getLocalisationAuditFaqItems(LLMS_LOCALE))}

## Docs

${formatLinks(DOCS_LINKS)}

## Blog

${buildBlogFull(getBlogPosts())}
`;
}
