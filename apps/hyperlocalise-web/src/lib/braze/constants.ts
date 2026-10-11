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

/** WorkOS Pipes data-integration slug for Braze. Configure this provider in the WorkOS Dashboard. */
export const BRAZE_PIPES_SLUG = "braze" satisfies PipesProviderSlug;

/**
 * Allowlisted Braze REST cluster keys.
 * @see https://www.braze.com/docs/api/basics#endpoints
 */
export const BRAZE_REST_ENDPOINTS = [
  "iad-01",
  "iad-02",
  "iad-03",
  "iad-04",
  "iad-05",
  "iad-06",
  "iad-07",
  "iad-08",
  "us-10",
  "fra-01",
  "fra-02",
  "au-01",
  "id-01",
  "jp-01",
  "kr-01",
] as const;

export type BrazeRestEndpoint = (typeof BRAZE_REST_ENDPOINTS)[number];

const BRAZE_REST_ENDPOINT_BASE_URLS: Record<BrazeRestEndpoint, string> = {
  "iad-01": "https://rest.iad-01.braze.com",
  "iad-02": "https://rest.iad-02.braze.com",
  "iad-03": "https://rest.iad-03.braze.com",
  "iad-04": "https://rest.iad-04.braze.com",
  "iad-05": "https://rest.iad-05.braze.com",
  "iad-06": "https://rest.iad-06.braze.com",
  "iad-07": "https://rest.iad-07.braze.com",
  "iad-08": "https://rest.iad-08.braze.com",
  "us-10": "https://rest.us-10.braze.com",
  "fra-01": "https://rest.fra-01.braze.eu",
  "fra-02": "https://rest.fra-02.braze.eu",
  "au-01": "https://rest.au-01.braze.com",
  "id-01": "https://rest.id-01.braze.com",
  "jp-01": "https://rest.jp-01.braze.com",
  "kr-01": "https://rest.kr-01.braze.com",
};

const BRAZE_REST_ENDPOINT_LABELS: Record<BrazeRestEndpoint, string> = {
  "iad-01": "US-01",
  "iad-02": "US-02",
  "iad-03": "US-03",
  "iad-04": "US-04",
  "iad-05": "US-05",
  "iad-06": "US-06",
  "iad-07": "US-07",
  "iad-08": "US-08",
  "us-10": "US-10",
  "fra-01": "EU-01",
  "fra-02": "EU-02",
  "au-01": "AU-01",
  "id-01": "ID-01",
  "jp-01": "JP-01",
  "kr-01": "KR-01",
};

export function isBrazeRestEndpoint(value: string): value is BrazeRestEndpoint {
  return (BRAZE_REST_ENDPOINTS as readonly string[]).includes(value);
}

export function resolveBrazeRestBaseUrl(restEndpoint: BrazeRestEndpoint): string {
  return BRAZE_REST_ENDPOINT_BASE_URLS[restEndpoint];
}

export function brazeRestEndpointLabel(restEndpoint: BrazeRestEndpoint): string {
  return BRAZE_REST_ENDPOINT_LABELS[restEndpoint];
}

export function brazeRestEndpointOptionLabel(restEndpoint: BrazeRestEndpoint): string {
  const host = BRAZE_REST_ENDPOINT_BASE_URLS[restEndpoint].replace(/^https:\/\//, "");
  return `${BRAZE_REST_ENDPOINT_LABELS[restEndpoint]} · ${host}`;
}
