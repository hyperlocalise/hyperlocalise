import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";

import { notFoundResponse } from "@/api/response.schema";
import {
  isFixtureAuthCookieSecure,
  isFixtureAuthEnabled,
  readE2eSetupTokenFromHeaders,
  verifyE2eSetupToken,
} from "@/lib/e2e/config";
import {
  cleanupFixtureAuthSession,
  createFixtureAuthSession,
  createFixtureOnboardingSession,
} from "@/lib/e2e/fixture-auth";

const createSessionBodySchema = z.object({
  mode: z.enum(["default", "onboarding"]).optional(),
  role: z
    .enum(["admin", "localization_manager", "developer", "reviewer", "translator", "member"])
    .optional(),
});

function rejectFixtureAuthRequest(c: Parameters<typeof notFoundResponse>[0]) {
  return notFoundResponse(c, "e2e_auth_disabled");
}

function isAuthorizedFixtureAuthRequest(c: { req: { raw: Request } }) {
  if (!isFixtureAuthEnabled()) {
    return false;
  }

  return verifyE2eSetupToken(readE2eSetupTokenFromHeaders(c.req.raw.headers));
}

export function createE2eAuthRoutes() {
  return new Hono()
    .post("/auth/session", async (c) => {
      if (!isAuthorizedFixtureAuthRequest(c)) {
        return rejectFixtureAuthRequest(c);
      }

      const parsed = createSessionBodySchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json({ error: "invalid_request", message: parsed.error.message }, 400);
      }

      const body = parsed.data;
      const cookieOptions = {
        httpOnly: true,
        path: "/",
        sameSite: "Lax" as const,
        secure: isFixtureAuthCookieSecure(c.req.raw),
      };

      if (body.mode === "onboarding") {
        const session = await createFixtureOnboardingSession();

        setCookie(c, "wos-session", session.sessionToken, cookieOptions);

        return c.json(
          {
            session: {
              email: session.email,
              workosUserId: session.workosUserId,
            },
          },
          201,
        );
      }

      const session = await createFixtureAuthSession({ role: body.role });

      setCookie(c, "wos-session", session.sessionToken, cookieOptions);

      return c.json(
        {
          session: {
            email: session.email,
            organizationSlug: session.organizationSlug,
            workosOrganizationId: session.workosOrganizationId,
            workosUserId: session.workosUserId,
          },
        },
        201,
      );
    })
    .delete("/auth/session", async (c) => {
      if (!isAuthorizedFixtureAuthRequest(c)) {
        return rejectFixtureAuthRequest(c);
      }

      await cleanupFixtureAuthSession(getCookie(c, "wos-session"));
      deleteCookie(c, "wos-session", { path: "/" });
      return c.body(null, 204);
    });
}
