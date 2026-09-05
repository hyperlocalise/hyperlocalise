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

export function getIntegrationNamesBySlug(locale: string) {
  return Object.fromEntries(getMarketingIntegrations(locale).map((item) => [item.slug, item.name]));
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
    capabilitiesHeading: intl.formatMessage({
      defaultMessage: "Capabilities",
      id: "oUdwcZdkjG",
      description: "Heading for the integration capabilities section",
    }),
    workflowsHeading: intl.formatMessage({
      defaultMessage: "Visual workflow examples",
      id: "BNs8waALWE",
      description: "Heading for the integration visual workflow examples section",
    }),
    workflowsDescription: intl.formatMessage({
      defaultMessage:
        "See how teams connect this integration to Hyperlocalise for localization workflows.",
      id: "2i4QuyVvsX",
      description: "Supporting copy for the integration workflow examples section",
    }),
    workflowTriggerLabel: intl.formatMessage({
      defaultMessage: "Trigger",
      id: "MsnNcIq3o0",
      description: "Label for workflow trigger nodes in the preview canvas",
    }),
    workflowActionLabel: intl.formatMessage({
      defaultMessage: "Action",
      id: "q9W62WYB+b",
      description: "Label for workflow action nodes in the preview canvas",
    }),
    workflowPreviewHint: intl.formatMessage({
      defaultMessage: "Click a step or use play to preview how the automation runs.",
      id: "WCvOhYUxHY",
      description: "Hint text above the interactive workflow preview canvas",
    }),
    workflowPlayLabel: intl.formatMessage({
      defaultMessage: "Play workflow preview",
      id: "HnLFJWChXa",
      description: "Accessible label for playing the workflow preview animation",
    }),
    workflowPauseLabel: intl.formatMessage({
      defaultMessage: "Pause workflow preview",
      id: "Go2Z9TjTft",
      description: "Accessible label for pausing the workflow preview animation",
    }),
    setupHeading: intl.formatMessage({
      defaultMessage: "Getting started",
      id: "0rhtNVSwNB",
      description: "Heading for the integration setup instructions section",
    }),
    relatedHeading: intl.formatMessage({
      defaultMessage: "Related integrations",
      id: "MvleTlgom0",
      description: "Heading for related integrations on the detail page",
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
      defaultMessage: "Get started with Hyperlocalise today",
      id: "vAwILOzBUa",
      description: "Headline for the bottom CTA on integration pages",
    }),
    finalCtaDescription: intl.formatMessage({
      defaultMessage:
        "Connect your stack and run agent-native localization workflows with reviewers, automations, and launch tools in one workspace.",
      id: "JRwdGo2HxU",
      description: "Supporting copy for the bottom CTA on integration pages",
    }),
    finalCtaPrimaryLabel: intl.formatMessage({
      defaultMessage: "Request a demo",
      id: "S2P95qzM5L",
      description: "Primary CTA button on integration pages",
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
              "Connect {integrationName} to Hyperlocalise and start running localization workflows with agents, reviewers, and automations in one workspace.",
            id: "eZMddlPk0j",
            description: "Supporting copy for the bottom CTA on integration detail pages",
          },
          { integrationName },
        )
      : copy.finalCtaDescription,
    primaryCtaLabel: copy.finalCtaPrimaryLabel,
    secondaryCtaLabel: copy.finalCtaSecondaryLabel,
  };
}
