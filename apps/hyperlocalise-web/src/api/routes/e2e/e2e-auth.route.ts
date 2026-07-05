import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { z } from "zod";

import { notFoundResponse } from "@/api/response.schema";
import { isFixtureAuthEnabled } from "@/lib/e2e/config";
import { createFixtureAuthSession, createFixtureOnboardingSession } from "@/lib/e2e/fixture-auth";

const createSessionBodySchema = z.object({
  mode: z.enum(["default", "onboarding"]).optional(),
  role: z
    .enum(["admin", "localization_manager", "developer", "reviewer", "translator", "member"])
    .optional(),
});

export function createE2eAuthRoutes() {
  return new Hono().post("/auth/session", async (c) => {
    if (!isFixtureAuthEnabled()) {
      return notFoundResponse(c, "e2e_auth_disabled");
    }

    const body = createSessionBodySchema.parse(await c.req.json().catch(() => ({})));

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
  });
}
