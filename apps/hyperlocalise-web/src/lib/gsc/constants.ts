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

export const GSC_OAUTH_PROVIDER_ID = "google-search-console";

export const GSC_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/webmasters.readonly",
] as const;

export const GSC_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GSC_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GSC_GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const GSC_DATE_RANGES = [
  "last_7_days",
  "last_28_days",
  "last_3_months",
  "last_6_months",
  "last_12_months",
] as const;

export type GscDateRange = (typeof GSC_DATE_RANGES)[number];

export const GSC_DEFAULT_DATE_RANGE: GscDateRange = "last_28_days";

export const GSC_COUNTRY_BY_MARKET: Record<string, string> = {
  "france-fr": "fra",
  "germany-de": "deu",
  "japan-ja": "jpn",
  "vietnam-vi": "vnm",
};

export const GSC_PERMISSION_UNVERIFIED = "siteUnverifiedUser";

export function gscCountryForMarket(marketId: string | null | undefined) {
  if (!marketId) {
    return null;
  }
  return GSC_COUNTRY_BY_MARKET[marketId] ?? null;
}

export function isGscDateRange(value: string): value is GscDateRange {
  return (GSC_DATE_RANGES as readonly string[]).includes(value);
}
