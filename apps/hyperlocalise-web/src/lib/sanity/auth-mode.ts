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

/** Sanity Integrations authentication method values (Crowdin-style selector). */
export const SANITY_AUTH_MODE_OAUTH = "oauth" as const;
export const SANITY_AUTH_MODE_API_TOKEN = "api_token" as const;

export type SanityAuthMode = typeof SANITY_AUTH_MODE_OAUTH | typeof SANITY_AUTH_MODE_API_TOKEN;

export function isSanityAuthMode(value: string): value is SanityAuthMode {
  return value === SANITY_AUTH_MODE_OAUTH || value === SANITY_AUTH_MODE_API_TOKEN;
}
