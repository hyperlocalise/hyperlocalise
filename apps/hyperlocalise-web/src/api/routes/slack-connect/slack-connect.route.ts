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
import { Hono } from "hono";
import { validator } from "hono/validator";

import { hasCapability } from "@/api/auth/policy";
import { type AuthVariables, workosAuthMiddleware } from "@/api/auth/workos";
import {
  badRequestResponse,
  forbiddenResponse,
  serviceUnavailableResponse,
} from "@/api/response.schema";
import {
  dismissSlackConnectInvite,
  getSlackConnectInviteView,
  requestSlackConnectInvite,
  type SlackConnectInviteError,
} from "@/lib/agents/slack/connect-invite";
import { isErr } from "@/lib/primitives/result/results";

import { dismissSlackConnectBodySchema } from "./slack-connect.schema";

const validateDismissBody = validator("json", (value, c) => {
  const parsed = dismissSlackConnectBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_slack_connect_payload");
  }

  return parsed.data;
});

function canUseSlackConnect(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "workspace:read");
}

function mapInviteError(
  c: Parameters<typeof badRequestResponse>[0],
  error: SlackConnectInviteError,
) {
  if (error.code === "slack_connect_not_configured") {
    return serviceUnavailableResponse(c, "slack_connect_not_configured");
  }

  if (error.code === "slack_connect_rate_limited") {
    return c.json(
      {
        error: "slack_connect_rate_limited" as const,
        message: "Wait before requesting another Slack invite.",
        details: { retryAfterSeconds: error.retryAfterSeconds },
      },
      429,
    );
  }

  return c.json(
    {
      error: "slack_connect_invite_failed" as const,
      message: "Unable to send a Slack Connect invite right now.",
    },
    502,
  );
}

export function createSlackConnectRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canUseSlackConnect(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const slackConnect = await getSlackConnectInviteView(
        c.var.auth.organization.localOrganizationId,
      );
      return c.json({ slackConnect }, 200);
    })
    .post("/", async (c) => {
      if (!canUseSlackConnect(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const slug = c.var.auth.organization.slug;
      if (!slug) {
        return badRequestResponse(c, "organization_slug_required");
      }

      const result = await requestSlackConnectInvite({
        organizationId: c.var.auth.organization.localOrganizationId,
        organizationSlug: slug,
        email: c.var.auth.user.email,
        userId: c.var.auth.user.localUserId,
      });
      if (isErr(result)) {
        return mapInviteError(c, result.error);
      }

      return c.json({ slackConnect: result.value }, 200);
    })
    .patch("/", validateDismissBody, async (c) => {
      if (!canUseSlackConnect(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const slackConnect = await dismissSlackConnectInvite(
        c.var.auth.organization.localOrganizationId,
      );
      return c.json({ slackConnect }, 200);
    });
}
