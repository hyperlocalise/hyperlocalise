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

export type IntegrationCapabilityDescriptor = {
  title: MessageDescriptor;
  description: MessageDescriptor;
};

export type IntegrationWorkflowStepDescriptor = {
  label: MessageDescriptor;
  description?: MessageDescriptor;
};

export type IntegrationWorkflowDescriptor = {
  title: MessageDescriptor;
  steps: readonly IntegrationWorkflowStepDescriptor[];
};

export type IntegrationSetupStepDescriptor = {
  title: MessageDescriptor;
  description: MessageDescriptor;
};

export type IntegrationProductDescriptor = {
  name: MessageDescriptor;
  description: MessageDescriptor;
};

export type IntegrationDetailCopyDescriptors = {
  capabilities?: readonly IntegrationCapabilityDescriptor[];
  workflows?: readonly IntegrationWorkflowDescriptor[];
  setupSteps?: readonly IntegrationSetupStepDescriptor[];
  products?: readonly IntegrationProductDescriptor[];
};

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
  relatedSlugs?: readonly string[];
  tmsProviderKind?: ExternalTmsProviderKind | "native";
};

export type ResolvedIntegrationCapability = {
  title: string;
  description: string;
};

export type ResolvedIntegrationWorkflowStep = {
  label: string;
  description?: string;
};

export type ResolvedIntegrationWorkflow = {
  title: string;
  steps: ResolvedIntegrationWorkflowStep[];
};

export type ResolvedIntegrationSetupStep = {
  title: string;
  description: string;
};

export type ResolvedIntegrationProduct = {
  name: string;
  description: string;
};

export type ResolvedIntegrationCopy = {
  name: string;
  tagline: string;
  overview: string[];
  capabilities: ResolvedIntegrationCapability[];
  workflows: ResolvedIntegrationWorkflow[];
  setupSteps: ResolvedIntegrationSetupStep[];
  products: ResolvedIntegrationProduct[];
  metadata: {
    title: string;
    description: string;
    keywords: string[];
  };
};

export type ResolvedIntegration = IntegrationCatalogEntry & ResolvedIntegrationCopy;
