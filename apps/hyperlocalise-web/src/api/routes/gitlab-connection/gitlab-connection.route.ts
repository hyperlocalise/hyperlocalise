/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { randomUUID } from "node:crypto";

import { and, count, eq, ilike, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { isIntegrationsReadAllowed } from "@/api/auth/capability-guards";
import { isWorkspaceOperatorRole } from "@/api/auth/roles";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { forbiddenResponse } from "@/api/response.schema";
import {
  buildGitlabAuthorizeUrl,
  getGitlabRedirectUri,
  isGitlabOAuthConfigured,
} from "@/lib/agents/gitlab/oauth";
import {
  createGitlabState,
  getGitlabStateSecret,
  GITLAB_STATE_TTL_MS,
} from "@/lib/agents/gitlab/oauth-state";
import { syncGitlabConnectionProjects } from "@/lib/agents/gitlab/projects";
import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";

import { searchGitlabProjectsSchema, updateGitlabProjectsSchema } from "./gitlab-connection.schema";

const logger = createLogger("gitlab-connection");

const validateProjectSearch = validator("query", (value) => {
  const parsed = searchGitlabProjectsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
});

const validateUpdateProjects = validator("json", (value, c) => {
  const parsed = updateGitlabProjectsSchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" as const }, 400);
  }

  return parsed.data;
});

function toPublicConnection(connection: typeof schema.gitlabConnections.$inferSelect) {
  return {
    id: connection.id,
    baseUrl: connection.baseUrl,
    gitlabUserId: connection.gitlabUserId,
    username: connection.username,
    displayName: connection.displayName,
    oauthExpiresAt: connection.oauthExpiresAt?.toISOString() ?? null,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

export function createGitlabConnectionRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!isIntegrationsReadAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const [connection] = await db
        .select()
        .from(schema.gitlabConnections)
        .where(
          eq(schema.gitlabConnections.organizationId, c.var.auth.organization.localOrganizationId),
        )
        .limit(1);

      if (!connection) {
        return c.json({ connection: null }, 200);
      }

      const [total] = await db
        .select({ value: count() })
        .from(schema.gitlabProjects)
        .where(eq(schema.gitlabProjects.gitlabConnectionId, connection.id));
      const [enabled] = await db
        .select({ value: count() })
        .from(schema.gitlabProjects)
        .where(
          and(
            eq(schema.gitlabProjects.gitlabConnectionId, connection.id),
            eq(schema.gitlabProjects.enabled, true),
          ),
        );

      return c.json(
        {
          connection: {
            ...toPublicConnection(connection),
            projectCount: total?.value ?? 0,
            enabledProjectCount: enabled?.value ?? 0,
          },
        },
        200,
      );
    })
    .get("/install-url", async (c) => {
      if (!isWorkspaceOperatorRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      if (!isGitlabOAuthConfigured()) {
        return c.json({ error: "gitlab_oauth_not_configured" }, 503);
      }

      const slug = c.var.auth.organization.slug ?? c.var.auth.organization.localOrganizationId;
      const nonce = randomUUID();
      const timestamp = Date.now();
      const state = await createGitlabState(slug, getGitlabStateSecret(), nonce, timestamp);

      await db.insert(schema.gitlabConnectionStates).values({
        nonce,
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        expiresAt: new Date(timestamp + GITLAB_STATE_TTL_MS),
      });

      const redirectUri = getGitlabRedirectUri(c.req.url);
      const url = buildGitlabAuthorizeUrl({ state, redirectUri });

      logger.info(
        {
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
        },
        "minted gitlab oauth authorize url",
      );

      return c.json({ url }, 200);
    })
    .get("/projects", validateProjectSearch, async (c) => {
      if (!isIntegrationsReadAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const organizationId = c.var.auth.organization.localOrganizationId;
      const query = c.req.valid("query").q?.trim();
      const conditions = [eq(schema.gitlabProjects.organizationId, organizationId)];
      if (query) {
        conditions.push(ilike(schema.gitlabProjects.pathWithNamespace, `%${query}%`));
      }

      const projects = await db
        .select({
          id: schema.gitlabProjects.id,
          gitlabProjectId: schema.gitlabProjects.gitlabProjectId,
          name: schema.gitlabProjects.name,
          pathWithNamespace: schema.gitlabProjects.pathWithNamespace,
          httpUrlToRepo: schema.gitlabProjects.httpUrlToRepo,
          private: schema.gitlabProjects.private,
          archived: schema.gitlabProjects.archived,
          defaultBranch: schema.gitlabProjects.defaultBranch,
          enabled: schema.gitlabProjects.enabled,
          lastSyncedAt: schema.gitlabProjects.lastSyncedAt,
        })
        .from(schema.gitlabProjects)
        .where(and(...conditions))
        .orderBy(schema.gitlabProjects.pathWithNamespace);

      return c.json({ projects }, 200);
    })
    .patch("/projects", validateUpdateProjects, async (c) => {
      if (!isWorkspaceOperatorRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const organizationId = c.var.auth.organization.localOrganizationId;
      const enabledProjectIds = [...new Set(c.req.valid("json").enabledProjectIds)];

      await db.transaction(async (tx) => {
        await tx
          .update(schema.gitlabProjects)
          .set({ enabled: false, updatedAt: new Date() })
          .where(eq(schema.gitlabProjects.organizationId, organizationId));

        if (enabledProjectIds.length > 0) {
          await tx
            .update(schema.gitlabProjects)
            .set({ enabled: true, updatedAt: new Date() })
            .where(
              and(
                eq(schema.gitlabProjects.organizationId, organizationId),
                inArray(schema.gitlabProjects.gitlabProjectId, enabledProjectIds),
              ),
            );
        }
      });

      const projects = await db
        .select({
          id: schema.gitlabProjects.id,
          gitlabProjectId: schema.gitlabProjects.gitlabProjectId,
          name: schema.gitlabProjects.name,
          pathWithNamespace: schema.gitlabProjects.pathWithNamespace,
          httpUrlToRepo: schema.gitlabProjects.httpUrlToRepo,
          private: schema.gitlabProjects.private,
          archived: schema.gitlabProjects.archived,
          defaultBranch: schema.gitlabProjects.defaultBranch,
          enabled: schema.gitlabProjects.enabled,
          lastSyncedAt: schema.gitlabProjects.lastSyncedAt,
        })
        .from(schema.gitlabProjects)
        .where(eq(schema.gitlabProjects.organizationId, organizationId))
        .orderBy(schema.gitlabProjects.pathWithNamespace);

      return c.json({ projects }, 200);
    })
    .post("/projects/sync", async (c) => {
      if (!isWorkspaceOperatorRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const [connection] = await db
        .select()
        .from(schema.gitlabConnections)
        .where(
          eq(schema.gitlabConnections.organizationId, c.var.auth.organization.localOrganizationId),
        )
        .limit(1);

      if (!connection) {
        return c.json({ error: "gitlab_connection_not_found" }, 404);
      }

      const synced = await syncGitlabConnectionProjects({
        organizationId: connection.organizationId,
        gitlabConnectionId: connection.id,
      });
      if (isErr(synced)) {
        logger.warn(
          { organizationId: connection.organizationId, error: synced.error },
          "gitlab project sync failed",
        );
        return c.json({ error: synced.error.code }, 502);
      }

      return c.json({ sync: { syncedProjectCount: synced.value.length } }, 200);
    })
    .delete("/", async (c) => {
      if (!isWorkspaceOperatorRole(c.var.auth.membership.role)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const organizationId = c.var.auth.organization.localOrganizationId;
      const [connection] = await db
        .select({ id: schema.gitlabConnections.id })
        .from(schema.gitlabConnections)
        .where(eq(schema.gitlabConnections.organizationId, organizationId))
        .limit(1);

      if (!connection) {
        return c.json({ error: "gitlab_connection_not_found" }, 404);
      }

      await db.transaction(async (tx) => {
        await tx
          .delete(schema.gitlabProjects)
          .where(eq(schema.gitlabProjects.organizationId, organizationId));
        await tx
          .delete(schema.gitlabConnections)
          .where(eq(schema.gitlabConnections.id, connection.id));
      });

      return c.body(null, 204);
    });
}

export const gitlabConnectionRoutes = createGitlabConnectionRoutes();
