import { createMiddleware } from "hono/factory";

import { unauthorizedResponse } from "@/api/response.schema";
import {
  isCanvaOAuthAccessToken,
  resolveCanvaOAuthSession,
  type CanvaOAuthSessionAuth,
} from "@/api/auth/canva-oauth";
import type { CanvaVerifiedUser } from "@/lib/canva/types";

export type CanvaIntegrationVariables = {
  canvaOAuth?: CanvaOAuthSessionAuth;
  canvaUser?: CanvaVerifiedUser;
};

function getBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export const canvaOAuthAuthMiddleware = createMiddleware<{
  Variables: CanvaIntegrationVariables;
}>(async (c, next) => {
  const bearer = getBearerToken(c.req.header("authorization"));
  if (!bearer || !isCanvaOAuthAccessToken(bearer)) {
    return unauthorizedResponse(
      c,
      "canva_oauth_token_required",
      "Hyperlocalise OAuth access token is required.",
    );
  }

  const session = await resolveCanvaOAuthSession(bearer);
  if (!session) {
    return unauthorizedResponse(
      c,
      "canva_oauth_token_invalid",
      "Hyperlocalise OAuth access token is invalid or expired.",
    );
  }

  c.set("canvaOAuth", session);
  await next();
});

export const optionalCanvaOAuthAuthMiddleware = createMiddleware<{
  Variables: CanvaIntegrationVariables;
}>(async (c, next) => {
  const bearer = getBearerToken(c.req.header("authorization"));
  if (bearer && isCanvaOAuthAccessToken(bearer)) {
    const session = await resolveCanvaOAuthSession(bearer);
    if (session) {
      c.set("canvaOAuth", session);
    }
  }

  await next();
});
