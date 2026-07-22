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

/** Semrush MCP streamable HTTP endpoint. */
export const SEMRUSH_MCP_URL = "https://mcp.semrush.com/v2/mcp";

/** Authorization scheme required by Semrush MCP API key auth. */
export const SEMRUSH_API_KEY_AUTH_PREFIX = "Apikey";

export function buildSemrushApiKeyAuthorizationHeader(apiKey: string): string {
  return `${SEMRUSH_API_KEY_AUTH_PREFIX} ${apiKey.trim()}`;
}
