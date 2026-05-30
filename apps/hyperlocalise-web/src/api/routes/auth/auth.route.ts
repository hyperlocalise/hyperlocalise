import { withAuth } from "@workos-inc/authkit-nextjs";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";

import { unauthorizedResponse, badRequestResponse } from "@/api/errors";
import { executeLegacyWorkspaceUpgrade } from "@/lib/organizations/upgrade-local-org-workspaces";
import { activeOrganizationCookieName } from "@/lib/workos/active-organization";

import { workosAuthMiddleware, type AuthVariables } from "../../auth/workos";

function storeActiveOrganizationSlug(c: Parameters<typeof setCookie>[0], slug: string) {
  setCookie(c, activeOrganizationCookieName, slug, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export const authRoutes = new Hono<{ Variables: AuthVariables }>()
  .post("/upgrade-workspace", async (c) => {
    if (!c.req.raw.headers.has("cookie")) {
      return unauthorizedResponse(c, "unauthorized", "Authentication required");
    }

    const session = await withAuth();

    if (!session.user) {
      return unauthorizedResponse(c, "unauthorized", "Authentication required");
    }

    const result = await executeLegacyWorkspaceUpgrade({ session });

    if (result.status === "failed") {
      return badRequestResponse(c, result.error, result.message, { migration: result.migration });
    }

    const slugMatch = result.redirectTo.match(/^\/org\/([^/]+)\//);
    if (slugMatch?.[1]) {
      storeActiveOrganizationSlug(c, slugMatch[1]);
    }

    return c.json(
      {
        workspaceUpgrade: {
          status: result.status,
          redirectTo: result.redirectTo,
          migration: result.migration,
        },
      },
      200,
    );
  })
  .use("*", workosAuthMiddleware)
  .get("/context", (c) => c.json({ auth: c.var.auth }, 200));
