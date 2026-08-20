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

/** Allowlisted Intercom regional REST endpoint keys. */
export const INTERCOM_REST_ENDPOINTS = ["us", "eu", "au"] as const;

export type IntercomRestEndpoint = (typeof INTERCOM_REST_ENDPOINTS)[number];

/** Bound Intercom /me identity check before saving a connection. */
export const INTERCOM_VALIDATE_TIMEOUT_MS = 30_000;

const INTERCOM_REST_ENDPOINT_BASE_URLS: Record<IntercomRestEndpoint, string> = {
  us: "https://api.intercom.io",
  eu: "https://api.eu.intercom.io",
  au: "https://api.au.intercom.io",
};

export function isIntercomRestEndpoint(value: string): value is IntercomRestEndpoint {
  return (INTERCOM_REST_ENDPOINTS as readonly string[]).includes(value);
}

export function resolveIntercomRestBaseUrl(restEndpoint: IntercomRestEndpoint): string {
  return INTERCOM_REST_ENDPOINT_BASE_URLS[restEndpoint];
}

export function intercomRestEndpointLabel(restEndpoint: IntercomRestEndpoint): string {
  switch (restEndpoint) {
    case "us":
      return "US";
    case "eu":
      return "Europe";
    case "au":
      return "Australia";
  }
}
