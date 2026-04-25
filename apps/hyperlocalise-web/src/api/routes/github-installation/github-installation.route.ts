import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { getGitHubStateSecret, signGitHubState } from "@/lib/agents/github/oauth-state";

function isAdminRole(role: string): boolean {
  return role === "owner" || role === "admin";
}

export function createGithubInstallationRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const installation = await db
        .select()
        .from(schema.githubInstallations)
        .where(
          eq(
            schema.githubInstallations.organizationId,
            c.var.auth.organization.localOrganizationId,
          ),
        )
        .limit(1);

      return c.json({ installation: installation[0] ?? null }, 200);
    })
    .get("/install-url", async (c) => {
      if (!isAdminRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      if (!env.GITHUB_APP_ID) {
        return c.json({ error: "github_app_not_configured" }, 503);
      }

      const slug = c.var.auth.organization.slug ?? c.var.auth.organization.localOrganizationId;
      const timestamp = Date.now();
      const payload = `${slug}:${timestamp}`;
      const secret = getGitHubStateSecret();
      const signature = await signGitHubState(payload, secret);
      const state = `${payload}:${signature}`;

      // TODO: support custom GitHub App URLs (e.g. GitHub Enterprise).
      const url = new URL("https://github.com/apps/hyperlocalise/installations/new");
      url.searchParams.set("state", state);

      return c.json({ url: url.toString() }, 200);
    })
    .delete("/", async (c) => {
      if (!isAdminRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const deleted = await db
        .delete(schema.githubInstallations)
        .where(
          eq(
            schema.githubInstallations.organizationId,
            c.var.auth.organization.localOrganizationId,
          ),
        )
        .returning({ id: schema.githubInstallations.id });

      if (deleted.length === 0) {
        return c.json({ error: "github_installation_not_found" }, 404);
      }

      // TODO: call GitHub API to delete the app installation if we want to
      // fully revoke access rather than just unlinking the local record.

      return c.body(null, 204);
    });
}

export const githubInstallationRoutes = createGithubInstallationRoutes();
