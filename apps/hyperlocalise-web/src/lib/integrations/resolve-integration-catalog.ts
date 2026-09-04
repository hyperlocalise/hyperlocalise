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
import type { IntlShape } from "@formatjs/intl";

import {
  getIntegrationCopyDescriptors,
  type IntegrationCatalogSlug,
} from "@/lib/integrations/integration-catalog.copy";
import { getIntegrationDetailCopyDescriptors } from "@/lib/integrations/integration-catalog.detail.copy";
import {
  integrationCatalogEntries,
  marketingIntegrationSlugs,
} from "@/lib/integrations/integration-catalog";
import type {
  IntegrationCatalogEntry,
  IntegrationCategory,
  ResolvedIntegration,
  ResolvedIntegrationCopy,
  ResolvedIntegrationCapability,
  ResolvedIntegrationProduct,
  ResolvedIntegrationSetupStep,
  ResolvedIntegrationWorkflow,
} from "@/lib/integrations/integration-catalog.types";
import { getIntlShape } from "@/lib/app-i18n/intl";

function resolveIntegrationCopy(
  intl: IntlShape,
  entry: IntegrationCatalogEntry,
): ResolvedIntegrationCopy {
  const descriptors = getIntegrationCopyDescriptors(entry.slug);
  const detailDescriptors = getIntegrationDetailCopyDescriptors(entry.slug);

  if (!descriptors) {
    return {
      name: entry.slug,
      tagline: "",
      overview: [],
      capabilities: [],
      workflows: [],
      setupSteps: [],
      products: [],
      metadata: {
        title: entry.slug,
        description: "",
        keywords: [...(entry.keywords ?? [])],
      },
    };
  }

  const name = intl.formatMessage(descriptors.name);
  const tagline = intl.formatMessage(descriptors.tagline);
  const overview = descriptors.overview?.map((paragraph) => intl.formatMessage(paragraph)) ?? [];
  const productName = descriptors.productName ? intl.formatMessage(descriptors.productName) : name;
  const productDescription = descriptors.productDescription
    ? intl.formatMessage(descriptors.productDescription)
    : tagline;

  const capabilities: ResolvedIntegrationCapability[] =
    detailDescriptors?.capabilities?.map((capability) => ({
      title: intl.formatMessage(capability.title),
      description: intl.formatMessage(capability.description),
    })) ?? [];

  const workflows: ResolvedIntegrationWorkflow[] =
    detailDescriptors?.workflows?.map((workflow) => ({
      title: intl.formatMessage(workflow.title),
      steps: workflow.steps.map((step) => ({
        label: intl.formatMessage(step.label),
        description: step.description ? intl.formatMessage(step.description) : undefined,
      })),
    })) ?? [];

  const setupSteps: ResolvedIntegrationSetupStep[] =
    detailDescriptors?.setupSteps?.map((step) => ({
      title: intl.formatMessage(step.title),
      description: intl.formatMessage(step.description),
    })) ?? [];

  const products: ResolvedIntegrationProduct[] = detailDescriptors?.products?.length
    ? detailDescriptors.products.map((product) => ({
        name: intl.formatMessage(product.name),
        description: intl.formatMessage(product.description),
      }))
    : [{ name: productName, description: productDescription }];

  return {
    name,
    tagline,
    overview,
    capabilities,
    workflows,
    setupSteps,
    products,
    metadata: {
      title: descriptors.metadataTitle
        ? intl.formatMessage(descriptors.metadataTitle)
        : `${name} | Hyperlocalise`,
      description: descriptors.metadataDescription
        ? intl.formatMessage(descriptors.metadataDescription)
        : tagline,
      keywords: [...(entry.keywords ?? [])],
    },
  };
}

export function resolveIntegration(
  intl: IntlShape,
  entry: IntegrationCatalogEntry,
): ResolvedIntegration {
  return {
    ...entry,
    ...resolveIntegrationCopy(intl, entry),
  };
}

export function resolveIntegrationBySlug(locale: string, slug: string): ResolvedIntegration | null {
  const entry = integrationCatalogEntries.find((item) => item.slug === slug);
  if (!entry) {
    return null;
  }

  return resolveIntegration(getIntlShape(locale), entry);
}

export function resolveMarketingIntegrations(locale: string): ResolvedIntegration[] {
  const intl = getIntlShape(locale);

  return integrationCatalogEntries
    .filter((entry) => entry.marketing)
    .map((entry) => resolveIntegration(intl, entry));
}

export function resolveRelatedIntegrations(
  locale: string,
  integration: ResolvedIntegration,
): ResolvedIntegration[] {
  const relatedSlugs = integration.relatedSlugs ?? [];
  if (relatedSlugs.length === 0) {
    return [];
  }

  const intl = getIntlShape(locale);

  return relatedSlugs
    .map((slug) => integrationCatalogEntries.find((entry) => entry.slug === slug))
    .filter((entry): entry is IntegrationCatalogEntry => entry !== undefined && entry.marketing)
    .map((entry) => resolveIntegration(intl, entry));
}

export function getMarketingIntegrationSlugs(): IntegrationCatalogSlug[] {
  return marketingIntegrationSlugs;
}

export function getIntegrationCategoryLabel(locale: string, category: IntegrationCategory) {
  const intl = getIntlShape(locale);

  const labels: Record<IntegrationCategory, string> = {
    "source-control": intl.formatMessage({
      defaultMessage: "Source control",
      id: "zwxg8T8BIz",
      description: "Marketing integrations marketplace category label for source control",
    }),
    collaboration: intl.formatMessage({
      defaultMessage: "Collaboration",
      id: "pnhrsfcx7g",
      description: "Marketing integrations marketplace category label for collaboration",
    }),
    tms: intl.formatMessage({
      defaultMessage: "Translation management",
      id: "qXzyjn9a/L",
      description: "Marketing integrations marketplace category label for TMS providers",
    }),
    cms: intl.formatMessage({
      defaultMessage: "Content & publishing",
      id: "N3evCv8pHM",
      description: "Marketing integrations marketplace category label for CMS connectors",
    }),
    guidelines: intl.formatMessage({
      defaultMessage: "Guidelines",
      id: "jrZHk5GYFz",
      description: "Marketing integrations marketplace category label for guideline sources",
    }),
    "customer-engagement": intl.formatMessage({
      defaultMessage: "Customer engagement",
      id: "kil6A974KX",
      description: "Marketing integrations marketplace category label for customer engagement",
    }),
    experimentation: intl.formatMessage({
      defaultMessage: "Experimentation",
      id: "gV2/zYwU9Y",
      description: "Marketing integrations marketplace category label for experimentation",
    }),
    "seo-tools": intl.formatMessage({
      defaultMessage: "SEO tools",
      id: "sYXOvYrlbj",
      description: "Marketing integrations marketplace category label for SEO tools",
    }),
    "mcp-servers": intl.formatMessage({
      defaultMessage: "MCP servers",
      id: "D2ZrcxejKr",
      description: "Category label for MCP server connections on the Integrations page",
    }),
  };

  return labels[category];
}

export function getMarketingIntegrationCategoryLabels(locale: string) {
  const categories: IntegrationCategory[] = [
    "source-control",
    "collaboration",
    "tms",
    "cms",
    "guidelines",
    "customer-engagement",
    "experimentation",
    "seo-tools",
  ];

  return categories.map((category) => ({
    id: category,
    label: getIntegrationCategoryLabel(locale, category),
  }));
}
