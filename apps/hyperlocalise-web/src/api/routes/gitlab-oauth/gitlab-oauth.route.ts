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
import { and, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";

import { isWorkspaceOperatorRole } from "@/api/auth/roles";
import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import { fetchGitlabCurrentUser } from "@/lib/agents/gitlab/api";
import { exchangeGitlabAuthorizationCode, getGitlabRedirectUri } from "@/lib/agents/gitlab/oauth";
import { getConfiguredGitlabBaseUrl } from "@/lib/agents/gitlab/base-url";
import { getGitlabStateSecret, verifyGitlabState } from "@/lib/agents/gitlab/oauth-state";
import { syncGitlabConnectionProjects } from "@/lib/agents/gitlab/projects";
import { buildEncryptedGitlabTokenFields } from "@/lib/agents/gitlab/tokens";
import {
  withWorkspaceResourceLimit,
  workspaceResourceFeatureIds,
} from "@/lib/billing/workspace-resource-limits";
import { db, schema, type DatabaseClient } from "@/lib/database";
import { createLogger } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";

const logger = createLogger("gitlab-oauth");

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function integrationsRedirect(slug: string, params: Record<string, string>) {
  const url = new URL(`/org/${slug}/integrations`, "http://localhost");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

function isUniqueViolation(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  if ("code" in error && error.code === "23505") {
    return true;
  }

  const cause = "cause" in error ? error.cause : undefined;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

async function resolveOrganizationFromState(verified: { slug: string }) {
  let [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, verified.slug))
    .limit(1);

  // install-url falls back to localOrganizationId when slug is missing.
  if (!org && uuidRegex.test(verified.slug)) {
    [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, verified.slug))
      .limit(1);
  }

  return org ?? null;
}

export function createGitlabOAuthRoutes() {
  return new Hono().get("/callback", async (c) => {
    const stateParam = c.req.query("state");
    if (!stateParam) {
      return c.redirect("/dashboard?error=missing_gitlab_state");
    }

    let verified: Awaited<ReturnType<typeof verifyGitlabState>>;
    try {
      verified = await verifyGitlabState(stateParam, getGitlabStateSecret());
    } catch {
      return c.redirect("/dashboard?error=gitlab_oauth_not_configured");
    }

    if (!verified) {
      return c.redirect("/dashboard?error=invalid_gitlab_state");
    }

    const errorParam = c.req.query("error");
    if (errorParam) {
      return c.redirect(
        integrationsRedirect(verified.slug, {
          error: errorParam === "access_denied" ? "gitlab_access_denied" : "gitlab_oauth_failed",
        }),
      );
    }

    const code = c.req.query("code");
    if (!code) {
      return c.redirect(integrationsRedirect(verified.slug, { error: "missing_gitlab_code" }));
    }

    const org = await resolveOrganizationFromState(verified);
    if (!org) {
      return c.redirect("/dashboard?error=organization_not_found");
    }

    const orgSlug = org.slug ?? org.id;
    const auth = await resolveApiAuthContextFromSession({
      cookie: c.req.header("cookie"),
      organizationSlug: org.slug ?? undefined,
    });
    const authOrganization = auth?.organizations.find(
      (item) => item.localOrganizationId === org.id,
    );
    if (!auth || !authOrganization) {
      return c.redirect("/dashboard?error=unauthorized");
    }

    if (!isWorkspaceOperatorRole(authOrganization.membership.role)) {
      return c.redirect(integrationsRedirect(orgSlug, { error: "gitlab_forbidden" }));
    }

    const now = new Date();
    const consumedStates = await db
      .update(schema.gitlabConnectionStates)
      .set({ consumedAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.gitlabConnectionStates.nonce, verified.nonce),
          eq(schema.gitlabConnectionStates.organizationId, org.id),
          eq(schema.gitlabConnectionStates.userId, auth.user.localUserId),
          gt(schema.gitlabConnectionStates.expiresAt, now),
          isNull(schema.gitlabConnectionStates.consumedAt),
        ),
      )
      .returning({ id: schema.gitlabConnectionStates.id });

    if (consumedStates.length === 0) {
      return c.redirect(integrationsRedirect(orgSlug, { error: "invalid_gitlab_state" }));
    }

    const redirectUri = getGitlabRedirectUri(c.req.url);
    const baseUrl = getConfiguredGitlabBaseUrl();
    const tokenResult = await exchangeGitlabAuthorizationCode({
      code,
      redirectUri,
      baseUrl,
    });
    if (isErr(tokenResult)) {
      logger.warn({ error: tokenResult.error }, "gitlab oauth token exchange failed");
      return c.redirect(integrationsRedirect(orgSlug, { error: "gitlab_oauth_failed" }));
    }

    const userResult = await fetchGitlabCurrentUser({
      baseUrl,
      accessToken: tokenResult.value.accessToken,
    });
    if (isErr(userResult)) {
      logger.warn({ error: userResult.error }, "gitlab oauth user fetch failed");
      return c.redirect(integrationsRedirect(orgSlug, { error: "gitlab_oauth_failed" }));
    }

    const encryptedFields = buildEncryptedGitlabTokenFields(tokenResult.value);
    const gitlabUserId = String(userResult.value.id);

    const [existingForOrg] = await db
      .select({ id: schema.gitlabConnections.id })
      .from(schema.gitlabConnections)
      .where(eq(schema.gitlabConnections.organizationId, org.id))
      .limit(1);

    const [conflictingUser] = await db
      .select({
        id: schema.gitlabConnections.id,
        organizationId: schema.gitlabConnections.organizationId,
      })
      .from(schema.gitlabConnections)
      .where(
        and(
          eq(schema.gitlabConnections.baseUrl, baseUrl),
          eq(schema.gitlabConnections.gitlabUserId, gitlabUserId),
        ),
      )
      .limit(1);

    if (conflictingUser && conflictingUser.organizationId !== org.id) {
      return c.redirect(
        integrationsRedirect(orgSlug, { error: "gitlab_account_already_connected" }),
      );
    }

    const upsertConnection = async (database: DatabaseClient) => {
      if (existingForOrg) {
        await database
          .update(schema.gitlabConnections)
          .set({
            baseUrl,
            gitlabUserId,
            username: userResult.value.username,
            displayName: userResult.value.name ?? null,
            ...encryptedFields,
            updatedAt: new Date(),
          })
          .where(eq(schema.gitlabConnections.id, existingForOrg.id));
        return existingForOrg.id;
      }

      const [inserted] = await database
        .insert(schema.gitlabConnections)
        .values({
          organizationId: org.id,
          baseUrl,
          gitlabUserId,
          username: userResult.value.username,
          displayName: userResult.value.name ?? null,
          ...encryptedFields,
        })
        .returning({ id: schema.gitlabConnections.id });

      if (!inserted) {
        throw new Error("gitlab_connection_insert_failed");
      }

      return inserted.id;
    };

    let connectionId: string;
    try {
      if (existingForOrg) {
        connectionId = await upsertConnection(db);
      } else {
        const limitResult = await withWorkspaceResourceLimit(
          {
            organizationId: org.id,
            featureId: workspaceResourceFeatureIds.integrations,
            additionalUsage: 1,
          },
          async (tx) => upsertConnection(tx),
        );
        if (isErr(limitResult)) {
          return c.redirect(
            integrationsRedirect(orgSlug, { error: "gitlab_workspace_resource_limit_reached" }),
          );
        }
        connectionId = limitResult.value;
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        return c.redirect(
          integrationsRedirect(orgSlug, { error: "gitlab_account_already_connected" }),
        );
      }
      logger.error({ err: error }, "gitlab connection upsert failed");
      return c.redirect(integrationsRedirect(orgSlug, { error: "gitlab_oauth_failed" }));
    }

    const syncResult = await syncGitlabConnectionProjects({
      organizationId: org.id,
      gitlabConnectionId: connectionId,
    });
    if (isErr(syncResult)) {
      logger.warn(
        { organizationId: org.id, error: syncResult.error },
        "gitlab project sync after connect failed",
      );
    }

    return c.redirect(integrationsRedirect(orgSlug, { gitlab_connected: "1" }));
  });
}

export const gitlabOAuthRoutes = createGitlabOAuthRoutes();
