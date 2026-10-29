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

/** WorkOS Pipes data-integration slug for Iterable. */
export const ITERABLE_PIPES_SLUG = "iterable" satisfies PipesProviderSlug;

export const ITERABLE_REGIONS = ["us", "eu"] as const;

export type IterableRegion = (typeof ITERABLE_REGIONS)[number];

const ITERABLE_REGION_BASE_URLS: Record<IterableRegion, string> = {
  us: "https://api.iterable.com",
  eu: "https://api.eu.iterable.com",
};

const ITERABLE_REGION_LABELS: Record<IterableRegion, string> = {
  us: "US",
  eu: "EU",
};

export const ITERABLE_MESSAGE_MEDIUMS = ["Email", "InApp", "Push", "SMS"] as const;

export type IterableMessageMedium = (typeof ITERABLE_MESSAGE_MEDIUMS)[number];

export const ITERABLE_IMPORT_CONCURRENCY = 3;

export const ITERABLE_EMAIL_CLIENT_TEMPLATE_PREFIX = "hl-iterable-";
export const ITERABLE_INAPP_CLIENT_TEMPLATE_PREFIX = "hl-iterable-inapp-";

export function isIterableRegion(value: string): value is IterableRegion {
  return (ITERABLE_REGIONS as readonly string[]).includes(value);
}

export function resolveIterableBaseUrl(region: IterableRegion): string {
  return ITERABLE_REGION_BASE_URLS[region];
}

export function iterableRegionLabel(region: IterableRegion): string {
  return ITERABLE_REGION_LABELS[region];
}

export function iterableRegionOptionLabel(region: IterableRegion): string {
  return `${ITERABLE_REGION_LABELS[region]} · ${ITERABLE_REGION_BASE_URLS[region]}`;
}
