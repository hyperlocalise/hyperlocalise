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

import { Client } from "@hubspot/api-client";

import { err, ok, type Result } from "@/lib/primitives/result/results";

import { HUBSPOT_REQUIRED_SCOPES } from "./constants";

export const HUBSPOT_CREDENTIALS_INVALID = {
  code: "hubspot_credentials_invalid" as const,
  message: "HubSpot rejected this access token. Check the private app and try again.",
};

export const HUBSPOT_SCOPES_MISSING = {
  code: "hubspot_credentials_invalid" as const,
  message:
    "This token is missing the content or forms scope. Update the private app and try again.",
};

export const HUBSPOT_TEMPORARILY_UNAVAILABLE = {
  code: "hubspot_temporarily_unavailable" as const,
  message: "HubSpot did not accept the request. Wait a moment and try saving again.",
};

export type HubspotPingError =
  | typeof HUBSPOT_CREDENTIALS_INVALID
  | typeof HUBSPOT_TEMPORARILY_UNAVAILABLE;

function readStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const record = error as { code?: unknown; statusCode?: unknown };
  if (typeof record.code === "number") {
    return record.code;
  }
  if (typeof record.statusCode === "number") {
    return record.statusCode;
  }
  return null;
}

export async function lookupHubspotTokenScopes(accessToken: string): Promise<string[]> {
  const client = new Client({ accessToken });
  // Generated oauth.accessTokensApi.get only accepts OAuth tokens. Private-app
  // tokens (pat-) are rejected there, so save uses the SDK request helper.
  const response = await client.apiRequest({
    method: "POST",
    path: "/oauth/v2/private-apps/get/access-token-info",
    body: { tokenKey: accessToken },
  });
  if (!response.ok) {
    throw { code: response.status };
  }
  const info = (await response.json()) as { scopes?: unknown };
  return Array.isArray(info.scopes)
    ? info.scopes.filter((scope): scope is string => typeof scope === "string")
    : [];
}

export async function pingHubspotCredentials(input: {
  accessToken: string;
  lookupScopes?: (accessToken: string) => Promise<string[]>;
}): Promise<Result<true, HubspotPingError>> {
  const token = input.accessToken.trim();
  if (!token) {
    return err(HUBSPOT_CREDENTIALS_INVALID);
  }
  const lookup = input.lookupScopes ?? lookupHubspotTokenScopes;
  try {
    const scopes = await lookup(token);
    const granted = new Set(scopes);
    if (HUBSPOT_REQUIRED_SCOPES.some((scope) => !granted.has(scope))) {
      return err(HUBSPOT_SCOPES_MISSING);
    }
    return ok(true);
  } catch (error) {
    const status = readStatus(error);
    if (status === 400 || status === 401 || status === 403 || status === 404) {
      return err(HUBSPOT_CREDENTIALS_INVALID);
    }
    return err(HUBSPOT_TEMPORARILY_UNAVAILABLE);
  }
}
