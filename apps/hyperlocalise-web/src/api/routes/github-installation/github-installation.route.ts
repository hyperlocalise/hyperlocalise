import { and, count, eq, ilike, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { getGitHubStateSecret, signGitHubState } from "@/lib/agents/github/oauth-state";
import { syncInstallationRepositories } from "@/lib/agents/github/repositories";

function isAdminRole(role: string): boolean {
  return role === "owner" || role === "admin";
}

const updateRepositoriesSchema = z.object({
  enabledRepositoryIds: z.array(z.number().int().positive()).default([]),
});

const searchRepositoriesSchema = z.object({
  q: z.string().optional(),
});

const validateRepositorySearch = validator("query", (value) => {
  const parsed = searchRepositoriesSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
});

const validateUpdateRepositories = validator("json", (value, c) => {
  const parsed = updateRepositoriesSchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" as const }, 400);
  }

  return parsed.data;
});

export function createGithubInstallationRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const [installation] = await db
        .select()
        .from(schema.githubInstallations)
        .where(
          eq(
            schema.githubInstallations.organizationId,
            c.var.auth.organization.localOrganizationId,
          ),
        )
        .limit(1);

      if (!installation) {
        return c.json({ installation: null }, 200);
      }

      const [total] = await db
        .select({ value: count() })
        .from(schema.githubInstallationRepositories)
        .where(
          eq(
            schema.githubInstallationRepositories.githubInstallationId,
            installation.githubInstallationId,
          ),
        );
      const [enabled] = await db
        .select({ value: count() })
        .from(schema.githubInstallationRepositories)
        .where(
          and(
            eq(
              schema.githubInstallationRepositories.githubInstallationId,
              installation.githubInstallationId,
            ),
            eq(schema.githubInstallationRepositories.enabled, true),
          ),
        );

      return c.json(
        {
          installation: {
            ...installation,
            repositoryCount: total?.value ?? 0,
            enabledRepositoryCount: enabled?.value ?? 0,
          },
        },
        200,
      );
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
    .get("/repositories", validateRepositorySearch, async (c) => {
      const organizationId = c.var.auth.organization.localOrganizationId;
      const query = c.req.valid("query").q?.trim();
      const conditions = [eq(schema.githubInstallationRepositories.organizationId, organizationId)];
      if (query) {
        conditions.push(ilike(schema.githubInstallationRepositories.fullName, `%${query}%`));
      }

      const repositories = await db
        .select()
        .from(schema.githubInstallationRepositories)
        .where(and(...conditions))
        .orderBy(schema.githubInstallationRepositories.fullName);

      return c.json({ repositories }, 200);
    })
    .patch("/repositories", validateUpdateRepositories, async (c) => {
      if (!isAdminRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const organizationId = c.var.auth.organization.localOrganizationId;
      const enabledRepositoryIds = [...new Set(c.req.valid("json").enabledRepositoryIds)];

      await db.transaction(async (tx) => {
        await tx
          .update(schema.githubInstallationRepositories)
          .set({ enabled: false, updatedAt: new Date() })
          .where(eq(schema.githubInstallationRepositories.organizationId, organizationId));

        if (enabledRepositoryIds.length > 0) {
          await tx
            .update(schema.githubInstallationRepositories)
            .set({ enabled: true, updatedAt: new Date() })
            .where(
              and(
                eq(schema.githubInstallationRepositories.organizationId, organizationId),
                inArray(
                  schema.githubInstallationRepositories.githubRepositoryId,
                  enabledRepositoryIds,
                ),
              ),
            );
        }
      });

      const repositories = await db
        .select()
        .from(schema.githubInstallationRepositories)
        .where(eq(schema.githubInstallationRepositories.organizationId, organizationId))
        .orderBy(schema.githubInstallationRepositories.fullName);

      return c.json({ repositories }, 200);
    })
    .post("/repositories/sync", async (c) => {
      if (!isAdminRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const [installation] = await db
        .select()
        .from(schema.githubInstallations)
        .where(
          eq(
            schema.githubInstallations.organizationId,
            c.var.auth.organization.localOrganizationId,
          ),
        )
        .limit(1);

      if (!installation) {
        return c.json({ error: "github_installation_not_found" }, 404);
      }

      const repositories = await syncInstallationRepositories({
        organizationId: installation.organizationId,
        githubInstallationId: installation.githubInstallationId,
      });

      return c.json({ syncedRepositoryCount: repositories.length }, 200);
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
