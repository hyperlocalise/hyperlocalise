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

/** Ahrefs MCP streamable HTTP endpoint. */
export const AHREFS_MCP_URL = "https://api.ahrefs.com/mcp/mcp";

/** Authorization scheme required by Ahrefs MCP API key auth. */
export const AHREFS_API_KEY_AUTH_PREFIX = "Bearer";

/** Bound MCP connect + tool discovery before the Ahrefs agent loop starts. */
export const AHREFS_MCP_CONNECT_TIMEOUT_MS = 30_000;

export function buildAhrefsApiKeyAuthorizationHeader(apiKey: string): string {
  return `${AHREFS_API_KEY_AUTH_PREFIX} ${apiKey.trim()}`;
}
