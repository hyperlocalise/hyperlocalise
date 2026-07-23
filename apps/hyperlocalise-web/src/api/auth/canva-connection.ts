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
import { getCanvaConnectionByToken } from "@/lib/canva/connections";
import type { CanvaVerifiedUser } from "@/lib/canva/types";

export type CanvaConnectionVariables = {
  canvaConnection: {
    id: string;
    organizationId: string;
    apiKeyId: string;
    projectId: string;
    sourceLocale: string;
    targetLocales: string[];
    canvaBrandId: string | null;
    enabled: boolean;
  };
  canvaUser?: CanvaVerifiedUser;
};

const CONNECTION_TOKEN_HEADER = "x-hyperlocalise-connection-token";

export const canvaConnectionAuthMiddleware = createMiddleware<{
  Variables: CanvaConnectionVariables;
}>(async (c, next) => {
  const connectionToken = c.req.header(CONNECTION_TOKEN_HEADER)?.trim();
  if (!connectionToken) {
    return unauthorizedResponse(
      c,
      "canva_connection_token_required",
      "Canva connection token is required.",
    );
  }

  const connection = await getCanvaConnectionByToken(connectionToken);
  if (!connection) {
    return unauthorizedResponse(
      c,
      "canva_connection_not_found",
      "Canva connection token is invalid.",
    );
  }

  if (!connection.enabled) {
    return forbiddenResponse(c, "canva_connection_disabled", "This Canva connection is disabled.");
  }

  c.set("canvaConnection", {
    id: connection.id,
    organizationId: connection.organizationId,
    apiKeyId: connection.apiKeyId,
    projectId: connection.projectId,
    sourceLocale: connection.sourceLocale,
    targetLocales: connection.targetLocales ?? [],
    canvaBrandId: connection.canvaBrandId,
    enabled: connection.enabled,
  });

  await next();
});
