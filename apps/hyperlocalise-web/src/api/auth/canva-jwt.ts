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
