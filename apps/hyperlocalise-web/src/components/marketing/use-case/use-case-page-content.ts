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
import type { UseCaseMessageKey } from "./use-case-page-content.messages";

export type { UseCaseMessageKey } from "./use-case-page-content.messages";

export type UseCasePersona = "localisation-manager" | "international-growth" | "developer";

/**
 * Server-safe registry of use case pages. Page copy lives in `stories/<slug>.ts`
 * (client modules); this file only holds routing, audience, and SEO keywords.
 */
export type UseCasePageContent = {
  slug: string;
  persona: UseCasePersona;
  labelKey: UseCaseMessageKey;
  keywords: string[];
};

export const useCasePages: UseCasePageContent[] = [
  {
    slug: "localisation-operations",
    persona: "localisation-manager",
    labelKey: "localisationOperationsLabel",
    keywords: [
      "localisation operations platform",
      "localisation programme management",
      "TMS agnostic localisation",
      "translation workflow automation",
    ],
  },
  {
    slug: "localisation-quality-monitoring",
    persona: "localisation-manager",
    labelKey: "qualityAndGuidelinesLabel",
    keywords: [
      "translation quality assurance",
      "brand guidelines translation",
      "glossary enforcement",
      "AI translation QA",
    ],
  },
  {
    slug: "help-center-localisation",
    persona: "localisation-manager",
    labelKey: "helpCenterLocalisationLabel",
    keywords: [
      "help center localisation",
      "knowledge base translation",
      "support content localisation",
      "Zendesk Intercom translation",
    ],
  },
  {
    slug: "market-entry",
    persona: "international-growth",
    labelKey: "marketEntryLabel",
    keywords: [
      "international market entry",
      "multilingual SEO",
      "international keyword research",
      "AI search visibility by market",
    ],
  },
  {
    slug: "marketing-localisation",
    persona: "international-growth",
    labelKey: "globalCampaignsLabel",
    keywords: [
      "global campaign localisation",
      "marketing translation",
      "creative localisation",
      "brand-safe translation",
    ],
  },
  {
    slug: "market-experimentation",
    persona: "international-growth",
    labelKey: "marketExperimentsLabel",
    keywords: [
      "market experimentation",
      "country A/B testing",
      "localised feature flags",
      "international growth experiments",
    ],
  },
  {
    slug: "github-release-localisation",
    persona: "developer",
    labelKey: "pullRequestLocalisationLabel",
    keywords: [
      "GitHub localisation",
      "localisation CI check",
      "i18n pull request automation",
      "continuous localisation",
    ],
  },
  {
    slug: "localisation-cli-and-api",
    persona: "developer",
    labelKey: "cliAndApiLabel",
    keywords: ["localisation CLI", "translation API", "i18n file sync", "localisation for CI/CD"],
  },
  {
    slug: "localisation-for-ai-coding-agents",
    persona: "developer",
    labelKey: "aiCodingAgentsLabel",
    keywords: [
      "localisation MCP server",
      "Claude Code localisation",
      "Cursor translation",
      "AI coding agent i18n",
    ],
  },
];

export const useCasePagesBySlug = Object.fromEntries(
  useCasePages.map((page) => [page.slug, page]),
) as Record<string, UseCasePageContent>;

export const useCaseSlugs = useCasePages.map((page) => page.slug);

export const useCaseFooterLinks = useCasePages.map((page) => ({
  useCaseLabelKey: page.labelKey,
  href: `/use-cases/${page.slug}`,
}));

/** Slugs that moved. Kept so old links and search results still land somewhere useful. */
export const RETIRED_USE_CASE_SLUGS: Record<string, string> = {
  "product-localisation": "github-release-localisation",
};
