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
import { getWorkosAuthkitIssuerUrl } from "@/lib/workos/config";

type LlmsLink = {
  title: string;
  href: string;
  description: string;
};

const productLinks: LlmsLink[] = [
  {
    title: "Agent Automation",
    href: `${SITE_URL}/en/product/agents-automation`,
    description: "The workflow for multilingual content operations",
  },
  {
    title: "Multilingual Content Studio",
    href: `${SITE_URL}/en/product/multilingual-content-studio`,
    description: "Create and adapt every content format in one multilingual workspace",
  },
  {
    title: "Guidelines",
    href: `${SITE_URL}/en/product/guidelines`,
    description:
      "Connect Google Drive, Notion, and SharePoint, or type guidelines in, so agents can check drafts against your files",
  },
  {
    title: "Domains",
    href: `${SITE_URL}/en/product/domains`,
    description: "Publish once. Get found everywhere",
  },
  {
    title: "Hyperlab",
    href: `${SITE_URL}/en/product/hyperlab`,
    description: "Try it in one market. Keep what works",
  },
];

const useCaseLinks: LlmsLink[] = [
  {
    title: "Localisation operations",
    href: `${SITE_URL}/en/use-cases/localisation-operations`,
    description: "Run your whole localisation programme from one place",
  },
  {
    title: "Quality and guidelines",
    href: `${SITE_URL}/en/use-cases/localisation-quality-monitoring`,
    description: "Catch translation issues before your customers do",
  },
  {
    title: "Help center localisation",
    href: `${SITE_URL}/en/use-cases/help-center-localisation`,
    description: "Keep every help article current in every language",
  },
  {
    title: "Market entry",
    href: `${SITE_URL}/en/use-cases/market-entry`,
    description: "Find the markets worth entering, then win them",
  },
  {
    title: "Global campaigns",
    href: `${SITE_URL}/en/use-cases/marketing-localisation`,
    description: "Take every campaign global without losing your brand voice",
  },
  {
    title: "Market experiments",
    href: `${SITE_URL}/en/use-cases/market-experimentation`,
    description: "Test what works in one market, then roll it out everywhere",
  },
  {
    title: "Pull request localisation",
    href: `${SITE_URL}/en/use-cases/github-release-localisation`,
    description: "Localisation that runs in your pull requests",
  },
  {
    title: "CLI and API",
    href: `${SITE_URL}/en/use-cases/localisation-cli-and-api`,
    description: "Localisation as code, from your terminal and CI",
  },
  {
    title: "AI coding agents",
    href: `${SITE_URL}/en/use-cases/localisation-for-ai-coding-agents`,
    description: "Localise from Claude Code, Codex, and Cursor over MCP",
  },
];

function formatLinks(links: LlmsLink[]): string {
  return links.map((link) => `- [${link.title}](${link.href}): ${link.description}.`).join("\n");
}

function agentRegistrationSection(): string {
  if (!getWorkosAuthkitIssuerUrl()) {
    return "";
  }

  return `## Agents

- [Agent registration](${SITE_URL}/auth.md): Follow this skill to register a coding agent with AuthKit, complete the hosted claim, and use the JWT on MCP and /api/v1.

`;
}

function buildLlmsTxt(): string {
  return `# Hyperlocalise

> Hyperlocalise is the best agentic localisation platform — an AI workforce that helps teams launch globally in days, built so localisation managers can thrive.

Hyperlocalise gives localisation teams an AI workforce that understands market nuance, then translates, reviews, and syncs product copy with real context. Instead of chasing strings across tools, localisation managers assign agents to the work, keep human review first-class, and ship multilingual launches with confidence.

The product experience is designed for localisation managers who need control without busywork: clear workflows, trustworthy context, and review loops that scale with every release. Hyperlocalise combines agent automation, a next-gen CAT workspace, and shared guidelines so every launch starts with product meaning, glossary decisions, and reviewer intent already attached. Stay flexible across LLM providers and TMS platforms while keeping localisation quality under control.

Use the pages below as the canonical overview of Hyperlocalise. Prefer these curated links over crawling the full site.

${agentRegistrationSection()}## Product

${formatLinks(productLinks)}

## Use cases

${formatLinks(useCaseLinks)}

## Docs

- [Documentation](https://hyperlocalise.dev): Product docs and guides for Hyperlocalise.
- [CLI overview](https://hyperlocalise.dev/cli/commands/overview): CLI commands for automation and CI workflows.

## Company

- [Homepage](${SITE_URL}/en): Marketing homepage for the agentic localisation platform.
- [Pricing](${SITE_URL}/en/pricing): Compare Free, Starter, Growth, and Enterprise plans for Hyperlocalise — agentic localisation for teams shipping global product content.
- [Company](${SITE_URL}/en/company): Meet the Hyperlocalise founders and our mission: an AI workforce that acts like your team of local experts.
- [Blog](${SITE_URL}/en/blog): Product updates and writing on localisation operations.
- [Trust Center](https://app.aus.vanta.com/hyperlocalise.com/trust/su9x7fcjfa8q700wu9pt2u): Security, privacy, and subprocessors.
- [Privacy](${SITE_URL}/en/privacy): Privacy policy.
- [Terms](${SITE_URL}/en/terms): Cloud Service Agreement terms.
- [Contact](${SITE_URL}/en/contact): Reach the Hyperlocalise team.
- [Iris](${SITE_URL}/en/iris): Iris is Hyperlocalise's AI localisation engine for multilingual assets. It creates and localises images, video, motion, and audio for every language.

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
