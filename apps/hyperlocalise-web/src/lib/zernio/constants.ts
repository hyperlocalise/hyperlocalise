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

/** Zernio REST base. Methods append `/v1` paths such as `/accounts`. */
export const ZERNIO_API_BASE_URL = "https://zernio.com/api/v1";

/** Bound connect + validation before an ads agent loop starts. */
export const ZERNIO_API_TIMEOUT_MS = 30_000;

export function buildZernioAuthorizationHeader(apiKey: string): string {
  return `Bearer ${apiKey.trim()}`;
}
