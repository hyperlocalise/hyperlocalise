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

export function getIntegrationDetailCopy(locale: string) {
  const intl = getIntlShape(locale);

  return {
    backToIntegrations: intl.formatMessage({
      defaultMessage: "Integrations",
      id: "a+4byYqJMM",
      description: "Breadcrumb link back to the integrations marketplace index",
    }),
    categoriesHeading: intl.formatMessage({
      defaultMessage: "Categories",
      id: "1aPQynUfhP",
      description: "Sidebar heading for integration categories on the detail page",
    }),
    typeHeading: intl.formatMessage({
      defaultMessage: "Type",
      id: "+aLhmpE/3m",
      description: "Sidebar heading for integration type on the detail page",
    }),
    statusHeading: intl.formatMessage({
      defaultMessage: "Status",
      id: "I9YGK1GW7I",
      description: "Sidebar heading for integration status on the detail page",
    }),
    resourcesHeading: intl.formatMessage({
      defaultMessage: "Resources",
      id: "mCX+DFnK+p",
      description: "Sidebar heading for integration resources on the detail page",
    }),
    overviewHeading: intl.formatMessage({
      defaultMessage: "Overview",
      id: "PcuSoVGaBu",
      description: "Heading for the integration overview section",
    }),
    productsHeading: intl.formatMessage({
      defaultMessage: "Products",
      id: "+yckLBiVoH",
      description: "Heading for the integration products section",
    }),
    websiteLink: intl.formatMessage({
      defaultMessage: "Website",
      id: "DbC71eoMLw",
      description: "External link label to an integration vendor website",
    }),
    docsLink: intl.formatMessage({
      defaultMessage: "Documentation",
      id: "rEDnl3jroe",
      description: "External link label to integration documentation",
    }),
    connectCta: intl.formatMessage({
      defaultMessage: "Connect in workspace",
      id: "QNSRYIrpG+",
      description: "Primary CTA on an integration detail page",
    }),
    comingSoonCta: intl.formatMessage({
      defaultMessage: "Coming soon",
      id: "RiK2KmxM3l",
      description: "Disabled CTA label for integrations that are not available yet",
    }),
    typeNative: intl.formatMessage({
      defaultMessage: "Hyperlocalise native",
      id: "XTqDUMqK14",
      description: "Integration type label for built-in Hyperlocalise products",
    }),
    typePartner: intl.formatMessage({
      defaultMessage: "Partner integration",
      id: "uOIaXMBfe4",
      description: "Integration type label for third-party connectors",
    }),
    statusAvailable: intl.formatMessage({
      defaultMessage: "Available",
      id: "RmyEf4DNO6",
      description: "Integration status label for available connectors",
    }),
    statusComingSoon: intl.formatMessage({
      defaultMessage: "Coming soon",
      id: "lgEi9eqa79",
      description: "Integration status label for upcoming connectors",
    }),
    statusNative: intl.formatMessage({
      defaultMessage: "Included",
      id: "Qyr22h2tBu",
      description: "Integration status label for built-in Hyperlocalise capabilities",
    }),
    finalCtaHeadline: intl.formatMessage({
      defaultMessage: "Get started with Hyperlocalise",
      id: "EA4eYo/c8H",
      description: "Headline for the bottom CTA on integration detail pages",
    }),
    finalCtaDescription: intl.formatMessage({
      defaultMessage:
        "Connect integrations from your workspace settings once you are onboarded to Hyperlocalise.",
      id: "+LauXjmWs2",
      description: "Supporting copy for the bottom CTA on integration detail pages",
    }),
  };
}
