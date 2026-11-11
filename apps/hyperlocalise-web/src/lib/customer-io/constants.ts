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

/** WorkOS Pipes data-integration slug for Customer.io. Configure this provider in the WorkOS Dashboard. */
export const CUSTOMER_IO_PIPES_SLUG = "customer-io" satisfies PipesProviderSlug;

/**
 * Allowlisted Customer.io App API regions.
 * US: `https://api.customer.io/v1`, EU: `https://api-eu.customer.io/v1`.
 * @see https://customer.io/docs/api/#section/Regions
 */
export const CUSTOMER_IO_REGIONS = ["us", "eu"] as const;

export type CustomerIoRegion = (typeof CUSTOMER_IO_REGIONS)[number];

const CUSTOMER_IO_REGION_BASE_URLS: Record<CustomerIoRegion, string> = {
  us: "https://api.customer.io/v1",
  eu: "https://api-eu.customer.io/v1",
};

const CUSTOMER_IO_REGION_LABELS: Record<CustomerIoRegion, string> = {
  us: "US",
  eu: "EU",
};

export function isCustomerIoRegion(value: string): value is CustomerIoRegion {
  return (CUSTOMER_IO_REGIONS as readonly string[]).includes(value);
}

export function resolveCustomerIoBaseUrl(region: CustomerIoRegion): string {
  return CUSTOMER_IO_REGION_BASE_URLS[region];
}

export function customerIoRegionLabel(region: CustomerIoRegion): string {
  return CUSTOMER_IO_REGION_LABELS[region];
}

export function customerIoRegionOptionLabel(region: CustomerIoRegion): string {
  return `${CUSTOMER_IO_REGION_LABELS[region]} · ${CUSTOMER_IO_REGION_BASE_URLS[region]}`;
}

/**
 * Message/action types eligible for localisation in v1 (Crowdin parity subset).
 * `in_app` carries an HTML body and is stored as an HTML envelope like email;
 * all other types use the JSON translation map. `webhook` actions carry
 * machine request config (no human text) and are excluded, as are
 * multilingual A/B variants.
 */
export const CUSTOMER_IO_RESOURCE_KINDS = [
  "campaign",
  "newsletter",
  "broadcast",
  "transactional",
] as const;

export type CustomerIoResourceKind = (typeof CUSTOMER_IO_RESOURCE_KINDS)[number];

export const CUSTOMER_IO_MESSAGE_TYPES = [
  "email",
  "push",
  "sms",
  "slack",
  "in_app",
  "whatsapp",
] as const;

export type CustomerIoMessageType = (typeof CUSTOMER_IO_MESSAGE_TYPES)[number];
