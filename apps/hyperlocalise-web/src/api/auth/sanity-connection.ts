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
import { createMiddleware } from "hono/factory";

import { forbiddenResponse, unauthorizedResponse } from "@/api/response.schema";
import { assertApiKeyUsableForSanity } from "@/lib/sanity/connections";
import { getSanityConnectionByOauthAccessToken } from "@/lib/sanity/oauth";

export type SanityConnectionVariables = {
  sanityConnection: {
    id: string;
    organizationId: string;
    apiKeyId: string;
    enabled: boolean;
    studioOrigin: string;
  };
};

const ACCESS_TOKEN_HEADER = "x-hyperlocalise-access-token";

export const sanityConnectionAuthMiddleware = createMiddleware<{
  Variables: SanityConnectionVariables;
}>(async (c, next) => {
  const accessToken = c.req.header(ACCESS_TOKEN_HEADER)?.trim();
  if (!accessToken) {
    return unauthorizedResponse(
      c,
      "sanity_access_token_required",
      "A Hyperlocalise access token is required.",
    );
  }

  const connection = await getSanityConnectionByOauthAccessToken(accessToken);
  if (!connection) {
    return unauthorizedResponse(
      c,
      "sanity_access_token_invalid",
      "Hyperlocalise access token is invalid or expired.",
    );
  }

  const requestOrigin = c.req.header("origin")?.trim();
  if (!requestOrigin || requestOrigin !== connection.studioOrigin) {
    return forbiddenResponse(
      c,
      "sanity_studio_origin_mismatch",
      "This access token is not valid for the requesting Studio origin.",
    );
  }

  if (!connection.enabled) {
    return forbiddenResponse(
      c,
      "sanity_connection_disabled",
      "This Sanity connection is disabled.",
    );
  }

  try {
    await assertApiKeyUsableForSanity({
      organizationId: connection.organizationId,
      apiKeyId: connection.apiKeyId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "sanity_api_key_not_found";
    if (message === "sanity_api_key_missing_permissions") {
      return forbiddenResponse(
        c,
        message,
        "The API key backing this Sanity connection is missing required permissions.",
      );
    }
    return unauthorizedResponse(
      c,
      "sanity_api_key_not_found",
      "The API key backing this Sanity connection is no longer valid.",
    );
  }

  c.set("sanityConnection", {
    id: connection.id,
    organizationId: connection.organizationId,
    apiKeyId: connection.apiKeyId,
    enabled: connection.enabled,
    studioOrigin: connection.studioOrigin,
  });

  await next();
});
