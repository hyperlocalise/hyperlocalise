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
import type { IntlShape } from "react-intl";
import type { SimpleIcon } from "simple-icons";

import { getIntegrationCopyDescriptors } from "@/lib/integrations/integration-catalog.copy";
import {
  getIntegrationCatalogEntry,
  getIntegrationCatalogEntriesForWorkspace,
  getTmsIntegrationCatalogEntries,
} from "@/lib/integrations/integration-catalog";
import type { IntegrationCategory } from "@/lib/integrations/integration-catalog.types";
import {
  getIntegrationIconForKey,
  getIntegrationIconForSlug,
} from "@/lib/integrations/integration-icons";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";

export const workspaceComingSoonCollaborationSlugs = ["microsoft-teams", "jira", "linear"] as const;

export const workspaceComingSoonGuidelineSlugs = ["google-drive", "sharepoint", "notion"] as const;

export const workspaceComingSoonCustomerEngagementSlugs = [
  "braze",
  "iterable",
  "customer-io",
  "hubspot",
  "mailchimp",
  "loops",
  "sendgrid",
  "resend",
] as const;

export type WorkspaceIntegrationSummary = {
  slug: string;
  name: string;
  detail: string;
  logoSrc?: string;
  icon?: SimpleIcon;
};

export function resolveWorkspaceIntegrationSummary(
  intl: IntlShape,
  slug: string,
): WorkspaceIntegrationSummary | null {
  const entry = getIntegrationCatalogEntry(slug);
  const descriptors = getIntegrationCopyDescriptors(slug);

  if (!entry || !descriptors) {
    return null;
  }

  const icon =
    (entry.iconKey ? getIntegrationIconForKey(entry.iconKey) : undefined) ??
    getIntegrationIconForSlug(slug);

  return {
    slug: entry.slug,
    name: intl.formatMessage(descriptors.name),
    detail: intl.formatMessage(descriptors.tagline),
    logoSrc: entry.logoSrc,
    icon,
  };
}

export function resolveWorkspaceIntegrationsBySlugs(
  intl: IntlShape,
  slugs: readonly string[],
): WorkspaceIntegrationSummary[] {
  return slugs
    .map((slug) => resolveWorkspaceIntegrationSummary(intl, slug))
    .filter((entry): entry is WorkspaceIntegrationSummary => entry !== null);
}

export function resolveWorkspaceComingSoonIntegrations(
  intl: IntlShape,
  category: IntegrationCategory,
): WorkspaceIntegrationSummary[] {
  return getIntegrationCatalogEntriesForWorkspace(category)
    .filter((entry) => entry.status === "coming-soon")
    .map((entry) => resolveWorkspaceIntegrationSummary(intl, entry.slug))
    .filter((entry): entry is WorkspaceIntegrationSummary => entry !== null);
}

export type TmsIntegrationConfig =
  | {
      name: string;
      providerKind: "native";
      logo: string;
      detail: string;
      included: true;
    }
  | {
      name: string;
      providerKind: ExternalTmsProviderKind;
      logo: string;
      icon?: SimpleIcon;
      detail: string;
      comingSoon?: boolean;
    };

export function resolveTmsIntegrationConfigs(intl: IntlShape): readonly TmsIntegrationConfig[] {
  return getTmsIntegrationCatalogEntries().map((entry) => {
    const descriptors = getIntegrationCopyDescriptors(entry.slug);
    const name = descriptors ? intl.formatMessage(descriptors.name) : entry.slug;
    const detail = descriptors ? intl.formatMessage(descriptors.tagline) : "";
    const logo = entry.logoSrc ?? "/images/logo.png";
    const icon = getIntegrationIconForSlug(entry.slug);

    if (entry.tmsProviderKind === "native") {
      return {
        name,
        providerKind: "native",
        logo,
        detail,
        included: true,
      };
    }

    return {
      name,
      providerKind: entry.tmsProviderKind!,
      logo,
      icon,
      detail,
      comingSoon: entry.status === "coming-soon",
    };
  });
}

export function resolveContentfulIntegrationConfig(intl: IntlShape) {
  const entry = getIntegrationCatalogEntry("contentful");
  const descriptors = getIntegrationCopyDescriptors("contentful");

  return {
    logo: entry?.logoSrc ?? "/images/contentful-logo.svg",
    name: descriptors ? intl.formatMessage(descriptors.name) : "Contentful",
    detail: descriptors ? intl.formatMessage(descriptors.tagline) : "",
  };
}
