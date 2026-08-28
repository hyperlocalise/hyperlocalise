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
import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { env } from "@/lib/env";
import { createLogger, serializeErrorForLog } from "@/lib/log";
import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { assertProviderCredentialAdmin } from "@/lib/providers/credentials/organization-provider-credentials";

import {
  verifySlackChannel,
  type SlackChannelListItem,
  type SlackChannelSearchError,
} from "@/lib/agents/slack/search-channels";

import { updateSlackAgentBodySchema, verifySlackChannelQuerySchema } from "./agent-slack.schema";

type SlackConnectorConfig = { teamId?: string; teamName?: string };
type SlackInstallation = { botToken: string };
type SlackChannelListError = { code: "installation_not_found" } | SlackChannelSearchError;

const logger = createLogger("agent-slack");

const validateUpdateSlackAgentBody = validator("json", (value, c) => {
  const parsed = updateSlackAgentBodySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_slack_agent_payload" as const }, 400);
  }

  return parsed.data;
});

const validateVerifySlackChannelQuery = validator("query", (value, c) => {
  const parsed = verifySlackChannelQuerySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_slack_channel_query" as const }, 400);
  }

  return parsed.data;
});

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

async function verifySlackChannelForTeam(
  teamId: string,
  input: { channelId: string; signal?: AbortSignal },
): Promise<Result<SlackChannelListItem | null, SlackChannelListError>> {
  const installationResult = await getSlackInstallation(teamId);
  if (isErr(installationResult)) {
    return installationResult;
  }

  return verifySlackChannel({
    botToken: installationResult.value.botToken,
    channelId: input.channelId,
    signal: input.signal,
  });
}

function slackChannelListErrorLogFields(error: SlackChannelListError) {
  switch (error.code) {
    case "installation_not_found":
    case "slack_rate_limited":
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
    .get("/channels/verify", validateVerifySlackChannelQuery, async (c) => {
      if (!isIntegrationsReadAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const connector = await getSlackConnector(c.var.auth.organization.localOrganizationId);
      const config = (connector?.config ?? {}) as SlackConnectorConfig;
      if (!connector?.enabled || !config.teamId) {
        return c.json({ error: "slack_not_connected" as const }, 404);
      }

      const query = c.req.valid("query");
      const channelResult = await verifySlackChannelForTeam(config.teamId, {
        channelId: query.channelId,
        signal: c.req.raw.signal,
      });
      if (isErr(channelResult)) {
        if (channelResult.error.code === "installation_not_found") {
          return c.json({ error: "slack_installation_not_found" as const }, 404);
        }

        logger.error(
          {
            ...slackChannelListErrorLogFields(channelResult.error),
            organizationId: c.var.auth.organization.localOrganizationId,
            teamId: config.teamId,
            errorCode: channelResult.error.code,
          },
          "slack channel verify failed",
        );
        return c.json({ error: "slack_channel_unavailable" as const }, 502);
      }

      if (!channelResult.value) {
        return c.json({ error: "slack_channel_not_found" as const }, 404);
      }

      return c.json({ channel: channelResult.value }, 200);
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
