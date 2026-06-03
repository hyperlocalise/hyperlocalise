import { and, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";

import { isWorkspaceOperatorRole } from "@/api/auth/roles";
import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import { getSlackBot } from "@/lib/agents/slack/bot";
import { findSlackConnectorOwnedByAnotherOrganization } from "@/lib/agents/slack/helpers";
import { getSlackStateSecret, verifySlackState } from "@/lib/agents/slack/oauth-state";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";

type SlackOAuthResult = Awaited<
  ReturnType<
    ReturnType<Awaited<ReturnType<typeof getSlackBot>>["getAdapter"]>["handleOAuthCallback"]
  >
>;

export function getSlackRedirectUri(requestUrl: string): string {
  if (env.SLACK_REDIRECT_URI) {
    return env.SLACK_REDIRECT_URI;
  }

  return `${new URL(requestUrl).origin}/api/auth/slack/callback`;
}

export function createSlackOAuthRoutes() {
  return new Hono().get("/callback", async (c) => {
    const stateParam = c.req.query("state");
    if (!stateParam) {
      return c.redirect("/dashboard?error=missing_slack_state");
    }

    const verified = await verifySlackState(stateParam, getSlackStateSecret());
    if (!verified) {
      return c.redirect("/dashboard?error=invalid_slack_state");
    }

    const errorParam = c.req.query("error");
    if (errorParam) {
      return c.redirect(`/dashboard?error=${encodeURIComponent(errorParam)}`);
    }

    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, verified.slug))
      .limit(1);

    if (!org) {
      return c.redirect("/dashboard?error=organization_not_found");
    }

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
      return c.redirect("/dashboard?error=forbidden");
    }

    const now = new Date();
    const consumedStates = await db
      .update(schema.slackInstallationStates)
      .set({ consumedAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.slackInstallationStates.nonce, verified.nonce),
          eq(schema.slackInstallationStates.organizationId, org.id),
          eq(schema.slackInstallationStates.userId, auth.user.localUserId),
          gt(schema.slackInstallationStates.expiresAt, now),
          isNull(schema.slackInstallationStates.consumedAt),
        ),
      )
      .returning({ id: schema.slackInstallationStates.id });

    if (consumedStates.length === 0) {
      return c.redirect("/dashboard?error=invalid_slack_state");
    }

    let oauthResult: SlackOAuthResult;
    try {
      const bot = await getSlackBot();
      await bot.initialize();

      const adapter = bot.getAdapter("slack");
      oauthResult = await adapter.handleOAuthCallback(c.req.raw, {
        redirectUri: getSlackRedirectUri(c.req.url),
      });
    } catch {
      return c.redirect("/dashboard?error=slack_oauth_failed");
    }
    const { teamId, installation } = oauthResult;

    const conflictingConnector = await findSlackConnectorOwnedByAnotherOrganization({
      teamId,
      organizationId: org.id,
    });
    if (conflictingConnector) {
      return c.redirect("/dashboard?error=slack_team_already_connected");
    }

    try {
      await db
        .insert(schema.connectors)
        .values({
          organizationId: org.id,
          kind: "slack",
          enabled: true,
          config: {
            teamId,
            teamName: installation.teamName,
            botUserId: installation.botUserId,
          },
        })
        .onConflictDoUpdate({
          target: [schema.connectors.organizationId, schema.connectors.kind],
          set: {
            enabled: true,
            config: {
              teamId,
              teamName: installation.teamName,
              botUserId: installation.botUserId,
            },
            updatedAt: new Date(),
          },
        });
    } catch {
      return c.redirect("/dashboard?error=slack_install_failed");
    }

    return c.redirect(`/org/${verified.slug}/integrations?slack_connected=1`);
  });
}
