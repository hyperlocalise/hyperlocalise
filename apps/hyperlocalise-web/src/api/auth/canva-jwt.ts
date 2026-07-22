/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { createMiddleware } from "hono/factory";

import { unauthorizedResponse } from "@/api/response.schema";
import { verifyCanvaUserToken } from "@/lib/canva/auth";
import type { CanvaVerifiedUser } from "@/lib/canva/types";
import { env } from "@/lib/env";

export type CanvaJwtVariables = {
  canvaUser?: CanvaVerifiedUser;
};

function getBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export function createCanvaJwtMiddleware(options: { required?: boolean } = {}) {
  const required = options.required ?? false;

  return createMiddleware<{ Variables: CanvaJwtVariables }>(async (c, next) => {
    const appId = env.CANVA_APP_ID;
    const token = getBearerToken(c.req.header("authorization"));

    if (!token) {
      if (required && appId) {
        return unauthorizedResponse(
          c,
          "canva_user_token_required",
          "Canva user token is required.",
        );
      }
      await next();
      return;
    }

    if (!appId) {
      await next();
      return;
    }

    try {
      const canvaUser = await verifyCanvaUserToken(token, appId);
      c.set("canvaUser", canvaUser);
      await next();
    } catch {
      return unauthorizedResponse(c, "canva_user_token_invalid", "Canva user token is invalid.");
    }
  });
}
