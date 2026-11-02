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

import type { PipesProviderSlug } from "@/lib/pipes/providers";

/** WorkOS Pipes catalog slug. Connect is OAuth from the HubSpot pane. */
export const HUBSPOT_PIPES_SLUG = "hubspot" satisfies PipesProviderSlug;

export const HUBSPOT_RESOURCE_KINDS = [
  "email",
  "form",
  "blog",
  "landing-page",
  "website-page",
  "message-template",
] as const;
export type HubspotResourceKind = (typeof HUBSPOT_RESOURCE_KINDS)[number];

export const HUBSPOT_LIST_PAGE_SIZE = 100;
