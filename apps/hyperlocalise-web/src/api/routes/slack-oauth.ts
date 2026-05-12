import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { getSlackBot } from "@/lib/agents/slack/bot";
import { getSlackStateSecret, verifySlackState } from "@/lib/agents/slack/oauth-state";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";

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

    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, verified.slug))
      .limit(1);

    if (!org) {
      return c.redirect("/dashboard?error=organization_not_found");
    }

    const bot = await getSlackBot();
    await bot.initialize();

    const adapter = bot.getAdapter("slack");
    const { teamId, installation } = await adapter.handleOAuthCallback(c.req.raw, {
      redirectUri: getSlackRedirectUri(c.req.url),
    });

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

    return c.redirect(`/org/${verified.slug}/agent?slack_connected=1`);
  });
}
