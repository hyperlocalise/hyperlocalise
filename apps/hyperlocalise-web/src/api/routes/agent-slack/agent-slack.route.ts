import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { isIntegrationsReadAllowed } from "@/api/auth/capability-guards";
import {
  conflictResponse,
  forbiddenResponse,
  serviceUnavailableResponse,
} from "@/api/response.schema";
import { type AuthVariables, workosAuthMiddleware } from "@/api/auth/workos";
import { getSlackRedirectUri } from "@/api/routes/slack-oauth/slack-oauth.route";
import {
  withWorkspaceResourceLimit,
  workspaceResourceFeatureIds,
  workspaceResourceLimitErrorDetails,
  workspaceResourceLimitMessage,
} from "@/lib/billing/workspace-resource-limits";
import { getSlackBot } from "@/lib/agents/slack/bot";
import {
  createSlackState,
  getSlackStateSecret,
  SLACK_STATE_TTL_MS,
} from "@/lib/agents/slack/oauth-state";
import { db, schema, type DatabaseClient } from "@/lib/database";
import { env } from "@/lib/env";
import { createLogger, serializeErrorForLog } from "@/lib/log";
import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { assertProviderCredentialAdmin } from "@/lib/providers/credentials/organization-provider-credentials";

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

type SlackChannelListItem = { id: string; name: string; private: boolean };
type SlackChannelListError =
  | { code: "installation_not_found" }
  | { code: "bot_unavailable"; cause: unknown }
  | { code: "slack_http_error"; status: number }
  | { code: "slack_api_error"; slackError: string };

const logger = createLogger("agent-slack");

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

async function getSlackInstallation(
  teamId: string,
): Promise<Result<SlackInstallation, SlackChannelListError>> {
  const installationResult = await fromThrowableAsync(
    (async () => {
      const bot = await getSlackBot();
      await bot.initialize();
      const adapter = bot.getAdapter("slack") as {
        getInstallation: (teamId: string) => Promise<SlackInstallation | null>;
      };

      return adapter.getInstallation(teamId);
    })(),
  );

  if (isErr(installationResult)) {
    return err({ code: "bot_unavailable", cause: installationResult.error });
  }

  if (!installationResult.value?.botToken) {
    return err({ code: "installation_not_found" });
  }

  return ok(installationResult.value);
}

async function listSlackChannels(
  botToken: string,
): Promise<Result<SlackChannelListItem[], SlackChannelListError>> {
  const channels: SlackChannelListItem[] = [];
  let cursor = "";

  do {
    const url = new URL("https://slack.com/api/conversations.list");
    url.searchParams.set("exclude_archived", "true");
    url.searchParams.set("limit", "1000");
    url.searchParams.set("types", "public_channel,private_channel");
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const responseResult = await fromThrowableAsync(
      fetch(url, {
        headers: { authorization: `Bearer ${botToken}` },
        redirect: "error",
      }),
    );
    if (isErr(responseResult)) {
      return err({ code: "bot_unavailable", cause: responseResult.error });
    }

    const response = responseResult.value;
    if (!response.ok) {
      return err({ code: "slack_http_error", status: response.status });
    }

    const bodyResult = await fromThrowableAsync(
      response.json() as Promise<SlackConversationsListResponse>,
    );
    if (isErr(bodyResult)) {
      return err({ code: "bot_unavailable", cause: bodyResult.error });
    }

    const body = bodyResult.value;
    if (!body.ok) {
      return err({ code: "slack_api_error", slackError: body.error ?? "unknown" });
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

  return ok(channels.sort((left, right) => left.name.localeCompare(right.name)));
}

async function loadSlackChannelsForTeam(
  teamId: string,
): Promise<Result<SlackChannelListItem[], SlackChannelListError>> {
  const installationResult = await getSlackInstallation(teamId);
  if (isErr(installationResult)) {
    return installationResult;
  }

  return listSlackChannels(installationResult.value.botToken);
}

function slackChannelListErrorLogFields(error: SlackChannelListError) {
  switch (error.code) {
    case "installation_not_found":
      return {};
    case "slack_api_error":
      return { slackError: error.slackError };
    case "slack_http_error":
      return { status: error.status };
    case "bot_unavailable":
      return { err: serializeErrorForLog(error.cause) };
  }
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

      const channelsResult = await loadSlackChannelsForTeam(config.teamId);
      if (isErr(channelsResult)) {
        if (channelsResult.error.code === "installation_not_found") {
          return c.json({ error: "slack_installation_not_found" as const }, 404);
        }

        logger.error(
          {
            ...slackChannelListErrorLogFields(channelsResult.error),
            organizationId: c.var.auth.organization.localOrganizationId,
            teamId: config.teamId,
            errorCode: channelsResult.error.code,
          },
          "slack channel list failed",
        );
        return c.json({ error: "slack_channels_unavailable" as const }, 502);
      }

      return c.json({ channels: channelsResult.value }, 200);
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

      const upsertSlackConnector = async (database: DatabaseClient) => {
        const [connector] = await database
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
          throw new Error("organization_not_found");
        }

        return connector;
      };

      let connector;
      if (payload.enabled) {
        const [existingConnector] = await db
          .select({ enabled: schema.connectors.enabled })
          .from(schema.connectors)
          .where(
            and(
              eq(schema.connectors.organizationId, organizationId),
              eq(schema.connectors.kind, "slack"),
            ),
          )
          .limit(1);

        if (!existingConnector?.enabled) {
          const limitResult = await withWorkspaceResourceLimit(
            {
              organizationId,
              featureId: workspaceResourceFeatureIds.integrations,
            },
            upsertSlackConnector,
          );
          if (!limitResult.ok) {
            if (limitResult.error.code === "workspace_resource_limit_check_failed") {
              return serviceUnavailableResponse(
                c,
                limitResult.error.code,
                "Unable to verify integration limits. Try again later.",
              );
            }

            return conflictResponse(
              c,
              limitResult.error.code,
              workspaceResourceLimitMessage(limitResult.error.featureId),
              workspaceResourceLimitErrorDetails(limitResult.error),
            );
          }

          connector = limitResult.value;
        } else {
          connector = await upsertSlackConnector(db);
        }
      } else {
        connector = await upsertSlackConnector(db);
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
