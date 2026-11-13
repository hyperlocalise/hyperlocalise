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
import { getIntlShape } from "@/lib/app-i18n/intl";
import { marketingIntegrationSlugs } from "@/lib/integrations/integration-catalog";
import type { IntegrationCatalogSlug } from "@/lib/integrations/integration-catalog.copy";
import type {
  IntegrationCategory,
  IntegrationIconKey,
  IntegrationStatus,
  IntegrationType,
  ResolvedIntegration,
} from "@/lib/integrations/integration-catalog.types";
import {
  getIntegrationCategoryLabel,
  getMarketingIntegrationCategoryLabels,
  resolveIntegrationBySlug,
  resolveMarketingIntegrations,
  resolveRelatedIntegrations,
} from "@/lib/integrations/resolve-integration-catalog";

export type { IntegrationCategory, IntegrationIconKey, IntegrationStatus, IntegrationType };

export type MarketingIntegrationProduct = ResolvedIntegration["products"][number];
export type MarketingIntegration = ResolvedIntegration;

export const integrationSlugs = marketingIntegrationSlugs;
export type IntegrationSlug = IntegrationCatalogSlug;

export function getMarketingIntegrations(locale: string) {
  return resolveMarketingIntegrations(locale);
}

export function getMarketingIntegrationBySlug(locale: string, slug: string) {
  return resolveIntegrationBySlug(locale, slug);
}

export function getRelatedIntegrations(locale: string, integration: MarketingIntegration) {
  return resolveRelatedIntegrations(locale, integration);
}

export function getIntegrationCategoryLabels(locale: string) {
  return getMarketingIntegrationCategoryLabels(locale);
}

export function getCategoryLabelForIntegration(locale: string, category: IntegrationCategory) {
  return getIntegrationCategoryLabel(locale, category);
}

export function getIntegrationsIndexCopy(locale: string) {
  const intl = getIntlShape(locale);

  return {
    headline: intl.formatMessage({
      defaultMessage: "Integrations",
      id: "62OptINLHU",
      description: "Primary headline on the marketing integrations marketplace index",
    }),
    subcopy: intl.formatMessage({
      defaultMessage:
        "Discover, connect, and manage the systems your team uses for source content, translation, and launch workflows.",
      id: "OsicY6Olwf",
      description: "Supporting copy under the integrations marketplace headline",
    }),
    searchPlaceholder: intl.formatMessage({
      defaultMessage: "Search integrations",
      id: "bkTMYJXmVj",
      description: "Placeholder for the integrations marketplace search field",
    }),
    filterAll: intl.formatMessage({
      defaultMessage: "All",
      id: "H+id7CtB39",
      description: "Category filter option showing every integration",
    }),
    emptyState: intl.formatMessage({
      defaultMessage: "No integrations match your search.",
      id: "Lm4tSgDdPG",
      description: "Empty state when integrations search returns no results",
    }),
    comingSoon: intl.formatMessage({
      defaultMessage: "Coming soon",
      id: "cDM7ee3Tdp",
      description: "Status badge on coming-soon integration cards",
    }),
    metadata: {
      title: intl.formatMessage({
        defaultMessage: "Integrations | Hyperlocalise",
        id: "d4hAcq1zeS",
        description: "Meta title for the marketing integrations marketplace index",
      }),
      description: intl.formatMessage({
        defaultMessage:
          "Connect GitHub, Slack, Crowdin, Contentful, and more to Hyperlocalise for agent-native localisation workflows.",
        id: "Y6emDnJZjf",
        description: "Meta description for the marketing integrations marketplace index",
      }),
    },
  };
}

export function getRelatedUseCaseLink(locale: string, slug: string | undefined) {
  if (!slug) {
    return null;
  }

  const intl = getIntlShape(locale);

  switch (slug) {
    case "github-release-localisation":
      return {
        href: `/use-cases/${slug}`,
        label: intl.formatMessage({
          defaultMessage: "See how localisation runs in pull requests",
          id: "VyKWMvrc32",
          description: "Link from an integration detail page to a related use case",
        }),
      };
    case "localisation-operations":
      return {
        href: `/use-cases/${slug}`,
        label: intl.formatMessage({
          defaultMessage: "See localisation operations",
          id: "aTMMaZ/NIC",
          description: "Link from an integration detail page to a related use case",
        }),
      };
    case "localisation-quality-monitoring":
      return {
        href: `/use-cases/${slug}`,
        label: intl.formatMessage({
          defaultMessage: "See quality and guidelines",
          id: "dMlTGb8y8K",
          description: "Link from an integration detail page to a related use case",
        }),
      };
    case "help-center-localisation":
      return {
        href: `/use-cases/${slug}`,
        label: intl.formatMessage({
          defaultMessage: "See help center localisation",
          id: "S98L6UPCrs",
          description: "Link from an integration detail page to a related use case",
        }),
      };
    case "marketing-localisation":
      return {
        href: `/use-cases/${slug}`,
        label: intl.formatMessage({
          defaultMessage: "See global campaign localisation",
          id: "0a2t1DglvU",
          description: "Link from an integration detail page to a related use case",
        }),
      };
    case "market-experimentation":
      return {
        href: `/use-cases/${slug}`,
        label: intl.formatMessage({
          defaultMessage: "See market experiments",
          id: "Iqtp/O62+3",
          description: "Link from an integration detail page to a related use case",
        }),
      };
    case "market-entry":
      return {
        href: `/use-cases/${slug}`,
        label: intl.formatMessage({
          defaultMessage: "See market entry",
          id: "QQ7mjZLpf/",
          description: "Link from an integration detail page to a related use case",
        }),
      };
    default:
      return null;
  }
}

export function getIntegrationDetailCopy(locale: string) {
  const intl = getIntlShape(locale);

  return {
    backToIntegrations: intl.formatMessage({
      defaultMessage: "Integrations",
      id: "a+4byYqJMM",
      description: "Breadcrumb link back to the integrations marketplace index",
    }),
    capabilitiesHeading: intl.formatMessage({
      defaultMessage: "What you get",
      id: "tXZ8YklgV8",
      description: "Heading for the integration capabilities section",
    }),
    workflowsHeading: intl.formatMessage({
      defaultMessage: "How it works",
      id: "EhdpNlS7rB",
      description: "Heading for the integration how-it-works section",
    }),
    setupHeading: intl.formatMessage({
      defaultMessage: "Getting started",
      id: "0rhtNVSwNB",
      description: "Heading for the integration setup instructions section",
    }),
    faqHeading: intl.formatMessage({
      defaultMessage: "Questions",
      id: "XqRKDh+lFi",
      description: "Heading for the integration FAQ section",
    }),
    relatedHeading: intl.formatMessage({
      defaultMessage: "Related integrations",
      id: "MvleTlgom0",
      description: "Heading for related integrations on the detail page",
    }),
    docsLink: intl.formatMessage({
      defaultMessage: "Documentation",
      id: "rEDnl3jroe",
      description: "External link label to integration documentation",
    }),
    comingSoonLabel: intl.formatMessage({
      defaultMessage: "Coming soon",
      id: "lgEi9eqa79",
      description: "Integration status label for upcoming connectors",
    }),
    requestDemoCta: intl.formatMessage({
      defaultMessage: "Request a demo",
      id: "S2P95qzM5L",
      description: "Primary CTA button on integration pages",
    }),
    signInLink: intl.formatMessage({
      defaultMessage: "Sign in",
      id: "gf1qW8hspy",
      description: "Quiet sign-in link on an integration detail page",
    }),
    finalCtaHeadline: intl.formatMessage({
      defaultMessage: "See it on a real localisation workflow",
      id: "zB4jW+ECjI",
      description: "Headline for the bottom CTA on integration pages",
    }),
    finalCtaDescription: intl.formatMessage({
      defaultMessage:
        "Walk through how your stack, reviewers, and launch checks fit together. No workspace required to start.",
      id: "XQHjNKbGQ9",
      description: "Supporting copy for the bottom CTA on integration pages",
    }),
    finalCtaSecondaryLabel: intl.formatMessage({
      defaultMessage: "Sign in to workspace",
      id: "b6B/tBg1a5",
      description: "Secondary CTA button on integration pages",
    }),
  };
}

export function getIntegrationCtaCopy(locale: string, integrationName?: string) {
  const intl = getIntlShape(locale);
  const copy = getIntegrationDetailCopy(locale);

  return {
    headline: copy.finalCtaHeadline,
    description: integrationName
      ? intl.formatMessage(
          {
            defaultMessage:
              "Request a demo to see {integrationName} in a localisation workflow with reviewers and launch checks.",
            id: "evNqLiubhh",
            description: "Supporting copy for the bottom CTA on integration detail pages",
          },
          { integrationName },
        )
      : copy.finalCtaDescription,
    primaryCtaLabel: copy.requestDemoCta,
    secondaryCtaLabel: copy.finalCtaSecondaryLabel,
  };
}
