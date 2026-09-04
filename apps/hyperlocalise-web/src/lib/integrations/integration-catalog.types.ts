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
import type { MessageDescriptor } from "@formatjs/intl";

import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";

export type IntegrationCategory =
  | "source-control"
  | "collaboration"
  | "tms"
  | "cms"
  | "guidelines"
  | "customer-engagement"
  | "experimentation"
  | "seo-tools"
  | "mcp-servers";

export type IntegrationStatus = "available" | "coming-soon" | "native";

export type IntegrationType = "native" | "partner";

export type IntegrationIconKey =
  | "github"
  | "gitlab"
  | "jira"
  | "linear"
  | "notion"
  | "resend"
  | "hubspot"
  | "mailchimp"
  | "loops"
  | "googledrive";

export type IntegrationCopyDescriptors = {
  name: MessageDescriptor;
  tagline: MessageDescriptor;
  overview?: readonly MessageDescriptor[];
  productName?: MessageDescriptor;
  productDescription?: MessageDescriptor;
  metadataTitle?: MessageDescriptor;
  metadataDescription?: MessageDescriptor;
};

export type IntegrationCatalogEntry = {
  slug: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  type: IntegrationType;
  marketing: boolean;
  workspace: boolean;
  logoSrc?: string;
  iconKey?: IntegrationIconKey;
  websiteUrl?: string;
  docsUrl?: string;
  keywords?: readonly string[];
  tmsProviderKind?: ExternalTmsProviderKind | "native";
};

export type ResolvedIntegrationCopy = {
  name: string;
  tagline: string;
  overview: string[];
  products: { name: string; description: string }[];
  metadata: {
    title: string;
    description: string;
    keywords: string[];
  };
};

export type ResolvedIntegration = IntegrationCatalogEntry & ResolvedIntegrationCopy;
