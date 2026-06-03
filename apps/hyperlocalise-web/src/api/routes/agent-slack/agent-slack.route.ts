import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { isIntegrationsReadAllowed } from "@/api/auth/capability-guards";
import { forbiddenResponse } from "@/api/response.schema";
import { type AuthVariables, workosAuthMiddleware } from "@/api/auth/workos";
import { getSlackRedirectUri } from "@/api/routes/slack-oauth/slack-oauth.route";
import { getSlackBot } from "@/lib/agents/slack/bot";
import {
  createSlackState,
  getSlackStateSecret,
  SLACK_STATE_TTL_MS,
} from "@/lib/agents/slack/oauth-state";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { providerSafeFetch } from "@/lib/providers/provider-safe-fetch";
import { assertProviderCredentialAdmin } from "@/lib/providers/organization-provider-credentials";

import { updateSlackAgentBodySchema } from "./agent-slack.schema";

type SlackConnectorConfig = { teamId?: string; teamName?: string };
type SlackInstallation = { botToken: string };
type SlackChannel = { id?: string; name?: string; is_private?: boolean; is_archived?: boolean };
type SlackConversationsListResponse = {
  ok?: boolean;
  error?: string;
  channels?: SlackChannel[];
  response_metadata?: { next_cursor?: string };
};

const validateUpdateSlackAgentBody = validator("json", (value, c) => {
  const parsed = updateSlackAgentBodySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_slack_agent_payload" as const }, 400);
  }

  return parsed.data;
});

function toCanonicalSlackChannelId(channelId: string) {
  return channelId.startsWith("slack:") ? channelId : `slack:${channelId}`;
}

async function getSlackConnector(organizationId: string) {
  const [connector] = await db
    .select()
    .from(schema.connectors)
    .where(
      and(
        eq(schema.connectors.organizationId, organizationId),
        eq(schema.connectors.kind, "slack"),
      ),
    )
    .limit(1);

  return connector ?? null;
}

async function getSlackInstallation(teamId: string): Promise<SlackInstallation | null> {
  const bot = await getSlackBot();
  await bot.initialize();
  const adapter = bot.getAdapter("slack") as {
    getInstallation: (teamId: string) => Promise<SlackInstallation | null>;
  };

  return adapter.getInstallation(teamId);
}

async function listSlackChannels(botToken: string) {
  const channels: Array<{ id: string; name: string; private: boolean }> = [];
  let cursor = "";

  do {
    const url = new URL("https://slack.com/api/conversations.list");
    url.searchParams.set("exclude_archived", "true");
    url.searchParams.set("limit", "1000");
    url.searchParams.set("types", "public_channel,private_channel");
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    // Use providerSafeFetch to prevent SSRF when calling Slack API
    const response = await providerSafeFetch(url, {
      headers: { authorization: `Bearer ${botToken}` },
    });
    if (!response.ok) {
      throw new Error("Slack channel list request failed");
    }

    const body = (await response.json()) as SlackConversationsListResponse;
    if (!body.ok) {
      throw new Error(body.error ?? "Slack channel list request failed");
    }

    for (const channel of body.channels ?? []) {
      if (!channel.id || !channel.name || channel.is_archived) {
        continue;
      }
      channels.push({
        id: toCanonicalSlackChannelId(channel.id),
        name: channel.name,
        private: Boolean(channel.is_private),
      });
    }

    cursor = body.response_metadata?.next_cursor ?? "";
  } while (cursor);

  return channels.sort((left, right) => left.name.localeCompare(right.name));
}

export function createAgentSlackRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!isIntegrationsReadAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const connector = await getSlackConnector(c.var.auth.organization.localOrganizationId);

      const enabled = connector?.enabled ?? false;
      const config = (connector?.config ?? {}) as SlackConnectorConfig;

      return c.json(
        {
          slackAgent: {
            enabled,
            teamId: config.teamId ?? null,
            teamName: config.teamName ?? null,
          },
        },
        200,
      );
    })
    .get("/channels", async (c) => {
      if (!isIntegrationsReadAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const connector = await getSlackConnector(c.var.auth.organization.localOrganizationId);
      const config = (connector?.config ?? {}) as SlackConnectorConfig;
      if (!connector?.enabled || !config.teamId) {
        return c.json({ channels: [] }, 200);
      }

      try {
        const installation = await getSlackInstallation(config.teamId);
        if (!installation?.botToken) {
          return c.json({ error: "slack_installation_not_found" as const }, 404);
        }

        const channels = await listSlackChannels(installation.botToken);
        return c.json({ channels }, 200);
      } catch {
        return c.json({ error: "slack_channels_unavailable" as const }, 502);
      }
    })
    .get("/install-url", async (c) => {
      try {
        assertProviderCredentialAdmin(c.var.auth.membership.role);
      } catch {
        return c.json({ error: "forbidden" as const }, 403);
      }

      if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET || !env.SLACK_OAUTH_STATE_SECRET) {
        return c.json({ error: "slack_app_not_configured" as const }, 503);
      }

      const slug = c.var.auth.organization.slug;
      if (!slug) {
        return c.json({ error: "organization_slug_required" as const }, 400);
      }

      const nonce = randomUUID();
      const timestamp = Date.now();
      const state = await createSlackState(slug, getSlackStateSecret(), nonce, timestamp);

      await db.insert(schema.slackInstallationStates).values({
        nonce,
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        expiresAt: new Date(timestamp + SLACK_STATE_TTL_MS),
      });

      const redirectUri = getSlackRedirectUri(c.req.url);

      const url = new URL("https://slack.com/oauth/v2/authorize");
      url.searchParams.set("client_id", env.SLACK_CLIENT_ID);
      url.searchParams.set(
        "scope",
        [
          "app_mentions:read",
          "channels:history",
          "channels:read",
          "chat:write",
          "files:read",
          "files:write",
          "groups:history",
          "groups:read",
          "im:history",
          "im:read",
          "mpim:history",
          "mpim:read",
          "reactions:read",
          "users:read",
          "users:read.email",
        ].join(","),
      );
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);

      return c.json({ url: url.toString() }, 200);
    })
    .patch("/", validateUpdateSlackAgentBody, async (c) => {
      const payload = c.req.valid("json");
      const organizationId = c.var.auth.organization.localOrganizationId;

      try {
        assertProviderCredentialAdmin(c.var.auth.membership.role);
      } catch {
        return c.json({ error: "forbidden" as const }, 403);
      }

      const [connector] = await db
        .insert(schema.connectors)
        .values({
          organizationId,
          kind: "slack",
          enabled: payload.enabled,
          config: {},
        })
        .onConflictDoUpdate({
          target: [schema.connectors.organizationId, schema.connectors.kind],
          set: {
            enabled: payload.enabled,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!connector) {
        return c.json({ error: "organization_not_found" as const }, 404);
      }

      const config = (connector.config ?? {}) as SlackConnectorConfig;

      return c.json(
        {
          slackAgent: {
            enabled: connector.enabled,
            teamId: config.teamId ?? null,
            teamName: config.teamName ?? null,
          },
        },
        200,
      );
    });
}
