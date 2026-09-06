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

import type { IntegrationCategory } from "@/lib/integrations/integration-catalog.types";

/** WorkOS Pipes slugs Hyperlocalise exposes through the org pipes API. */
export const PIPES_PROVIDER_SLUGS = [
  "ahrefs",
  "atlassian",
  "hubspot",
  "intercom",
  "mailchimp",
  "notion",
  "resend",
  "sanity",
  "sendgrid",
  "similarweb",
  "webflow",
] as const;

export type PipesProviderSlug = (typeof PIPES_PROVIDER_SLUGS)[number];

export const PIPES_PROVIDER_CATEGORIES = {
  ahrefs: "seo-tools",
  similarweb: "seo-tools",
  intercom: "customer-engagement",
  hubspot: "customer-engagement",
  mailchimp: "customer-engagement",
  sendgrid: "customer-engagement",
  resend: "customer-engagement",
  webflow: "cms",
  sanity: "cms",
  notion: "guidelines",
  atlassian: "collaboration",
} as const satisfies Record<PipesProviderSlug, IntegrationCategory>;

export function isPipesProviderSlug(value: string): value is PipesProviderSlug {
  return (PIPES_PROVIDER_SLUGS as readonly string[]).includes(value);
}

export function pipesProvidersForCategory(category: IntegrationCategory): PipesProviderSlug[] {
  return PIPES_PROVIDER_SLUGS.filter((slug) => PIPES_PROVIDER_CATEGORIES[slug] === category);
}
