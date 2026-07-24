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
import { SITE_URL } from "@/lib/seo/site-url";

export const dynamic = "force-static";

type LlmsLink = {
  title: string;
  href: string;
  description: string;
};

const productLinks: LlmsLink[] = [
  {
    title: "Agents Automation",
    href: `${SITE_URL}/en/product/agents-automation`,
    description: "Stop chasing localisation work across tools",
  },
  {
    title: "Next-gen CAT Tool",
    href: `${SITE_URL}/en/product/next-gen-cat-tool`,
    description: "Review translations without guessing what the string means",
  },
  {
    title: "Self-evolving Knowledge",
    href: `${SITE_URL}/en/product/self-evolving-knowledge`,
    description: "Stop repeating the same localisation feedback",
  },
];

const useCaseLinks: LlmsLink[] = [
  {
    title: "Product localisation",
    href: `${SITE_URL}/en/use-cases/product-localisation`,
    description: "Product localisation that keeps up with every release",
  },
  {
    title: "Marketing localisation",
    href: `${SITE_URL}/en/use-cases/marketing-localisation`,
    description: "Campaign localisation that protects brand voice in every market",
  },
  {
    title: "Help center localisation",
    href: `${SITE_URL}/en/use-cases/help-center-localisation`,
    description: "Support content that stays current in every language",
  },
  {
    title: "GitHub release localisation",
    href: `${SITE_URL}/en/use-cases/github-release-localisation`,
    description: "Localisation checks that run with every pull request",
  },
  {
    title: "Localisation quality monitoring",
    href: `${SITE_URL}/en/use-cases/localisation-quality-monitoring`,
    description: "Catch translation drift before your customers do",
  },
  {
    title: "Localisation operations",
    href: `${SITE_URL}/en/use-cases/localisation-operations`,
    description: "One operations layer across your entire localisation stack",
  },
];

function formatLinks(links: LlmsLink[]): string {
  return links.map((link) => `- [${link.title}](${link.href}): ${link.description}.`).join("\n");
}

function buildLlmsTxt(): string {
  return `# Hyperlocalise

> Hyperlocalise is the best agentic localisation platform — an AI workforce that helps teams launch globally in days, built so localisation managers can thrive.

Hyperlocalise gives localisation teams an AI workforce that understands market nuance, then translates, reviews, and syncs product copy with real context. Instead of chasing strings across tools, localisation managers assign agents to the work, keep human review first-class, and ship multilingual launches with confidence.

The product experience is designed for localisation managers who need control without busywork: clear workflows, trustworthy context, and review loops that scale with every release. Hyperlocalise combines agent automation, a next-gen CAT workspace, and self-evolving knowledge so every launch starts with product meaning, glossary decisions, and reviewer intent already attached. Stay flexible across LLM providers and TMS platforms while keeping localisation quality under control.

Use the pages below as the canonical overview of Hyperlocalise. Prefer these curated links over crawling the full site.

## Product

${formatLinks(productLinks)}

## Use cases

${formatLinks(useCaseLinks)}

## Docs

- [Documentation](https://hyperlocalise.dev): Product docs and guides for Hyperlocalise.
- [CLI overview](https://hyperlocalise.dev/commands/overview): CLI commands for automation and CI workflows.

## Company

- [Homepage](${SITE_URL}/en): Marketing homepage for the agentic localisation platform.
- [Blog](${SITE_URL}/en/blog): Product updates and writing on localisation operations.
- [Trust Center](${SITE_URL}/en/trust-center): Security, privacy, and subprocessors.
- [Privacy](${SITE_URL}/en/privacy): Privacy policy.
- [Terms](${SITE_URL}/en/terms): Terms of service.
- [Contact](mailto:minh@hyperlocalise.com): Email Hyperlocalise.

## Optional

- [LinkedIn](https://www.linkedin.com/company/hyperlocalise/): Company page.
`;
}

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
