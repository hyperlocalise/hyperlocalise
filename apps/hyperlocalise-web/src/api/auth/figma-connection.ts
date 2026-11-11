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
import { assertApiKeyUsableForFigma, getFigmaConnectionByToken } from "@/lib/figma/connections";
import { getFigmaConnectionByOauthAccessToken } from "@/lib/figma/oauth";
export type FigmaConnectionVariables = {
  figmaConnection: {
    id: string;
    organizationId: string;
    apiKeyId: string;
    enabled: boolean;
  };
};

const CONNECTION_TOKEN_HEADER = "x-hyperlocalise-connection-token";
const ACCESS_TOKEN_HEADER = "x-hyperlocalise-access-token";

export const figmaConnectionAuthMiddleware = createMiddleware<{
  Variables: FigmaConnectionVariables;
}>(async (c, next) => {
  const accessToken = c.req.header(ACCESS_TOKEN_HEADER)?.trim();
  const connectionToken = c.req.header(CONNECTION_TOKEN_HEADER)?.trim();
  if (!accessToken && !connectionToken) {
    return unauthorizedResponse(
      c,
      "figma_connection_token_required",
      "A Hyperlocalise access token or Figma connection token is required.",
    );
  }

  const connection = accessToken
    ? await getFigmaConnectionByOauthAccessToken(accessToken)
    : await getFigmaConnectionByToken(connectionToken ?? "");
  if (!connection) {
    return unauthorizedResponse(
      c,
      accessToken ? "figma_access_token_invalid" : "figma_connection_not_found",
      accessToken
        ? "Hyperlocalise access token is invalid or expired."
        : "Figma connection token is invalid.",
    );
  }

  if (!connection.enabled) {
    return forbiddenResponse(c, "figma_connection_disabled", "This Figma connection is disabled.");
  }

  try {
    await assertApiKeyUsableForFigma({
      organizationId: connection.organizationId,
      apiKeyId: connection.apiKeyId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "figma_api_key_not_found";
    if (message === "figma_api_key_missing_permissions") {
      return forbiddenResponse(
        c,
        message,
        "The API key backing this Figma connection is missing required permissions.",
      );
    }
    return unauthorizedResponse(
      c,
      "figma_api_key_not_found",
      "The API key backing this Figma connection is no longer valid.",
    );
  }

  c.set("figmaConnection", {
    id: connection.id,
    organizationId: connection.organizationId,
    apiKeyId: connection.apiKeyId,
    enabled: connection.enabled,
  });

  await next();
});
