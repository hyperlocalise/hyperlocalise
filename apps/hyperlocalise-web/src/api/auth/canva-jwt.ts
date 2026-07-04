import { createMiddleware } from "hono/factory";

import { unauthorizedResponse } from "@/api/response.schema";
import { verifyCanvaUserToken } from "@/lib/canva/auth";
import type { CanvaVerifiedUser } from "@/lib/canva/types";
import { env } from "@/lib/env";

export type CanvaJwtVariables = {
  canvaUser?: CanvaVerifiedUser;
};

const CANVA_USER_TOKEN_HEADER = "x-canva-user-token";

function getCanvaUserToken(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const dedicated = c.req.header(CANVA_USER_TOKEN_HEADER)?.trim();
  if (dedicated) {
    return dedicated;
  }

  const authorization = c.req.header("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (token && !token.startsWith("hl_canva_")) {
      return token;
    }
  }

  return null;
}

export function createCanvaJwtMiddleware(options: { required?: boolean } = {}) {
  const required = options.required ?? false;

  return createMiddleware<{ Variables: CanvaJwtVariables }>(async (c, next) => {
    const appId = env.CANVA_APP_ID;
    const token = getCanvaUserToken(c);

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
