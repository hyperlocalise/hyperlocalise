import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";

import { notFoundResponse } from "@/api/response.schema";
import { isFixtureAuthEnabled } from "@/lib/e2e/config";
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

export function createE2eAuthRoutes() {
  return new Hono()
    .post("/auth/session", async (c) => {
      if (!isFixtureAuthEnabled()) {
        return notFoundResponse(c, "e2e_auth_disabled");
      }

      const parsed = createSessionBodySchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json({ error: "invalid_request", message: parsed.error.message }, 400);
      }

      const body = parsed.data;

      if (body.mode === "onboarding") {
        const session = await createFixtureOnboardingSession();

        setCookie(c, "wos-session", session.sessionToken, {
          httpOnly: true,
          path: "/",
          sameSite: "Lax",
          secure: false,
        });

        return c.json(
          {
            session: {
              email: session.email,
              sessionToken: session.sessionToken,
              workosUserId: session.workosUserId,
            },
          },
          201,
        );
      }

      const session = await createFixtureAuthSession({ role: body.role });

      setCookie(c, "wos-session", session.sessionToken, {
        httpOnly: true,
        path: "/",
        sameSite: "Lax",
        secure: false,
      });

      return c.json(
        {
          session: {
            email: session.email,
            organizationSlug: session.organizationSlug,
            sessionToken: session.sessionToken,
            workosOrganizationId: session.workosOrganizationId,
            workosUserId: session.workosUserId,
          },
        },
        201,
      );
    })
    .delete("/auth/session", async (c) => {
      if (!isFixtureAuthEnabled()) {
        return notFoundResponse(c, "e2e_auth_disabled");
      }

      await cleanupFixtureAuthSession(getCookie(c, "wos-session"));
      deleteCookie(c, "wos-session", { path: "/" });
      return c.body(null, 204);
    });
}
