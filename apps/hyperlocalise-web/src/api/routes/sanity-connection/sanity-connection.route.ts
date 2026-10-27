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
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { badRequestResponse, forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import {
  enqueueIntegrationConnectedActivity,
  enqueueIntegrationDisconnectedActivity,
} from "@/lib/activity-log/integration-events";
import { sessionActivityActor } from "@/lib/activity-log/file-segment-events";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import {
  createSanityConnection,
  deleteSanityConnection,
  getSanityConnection,
  listSanityConnections,
  updateSanityConnection,
} from "@/lib/sanity/connections";

import {
  sanityConnectionIdParamSchema,
  createSanityConnectionBodySchema,
  updateSanityConnectionBodySchema,
} from "./sanity-connection.schema";

const validateConnectionIdParams = validator("param", (value, c) => {
  const parsed = sanityConnectionIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return notFoundResponse(c, "sanity_connection_not_found");
  }
  return parsed.data;
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createSanityConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_sanity_connection_payload",
      "Sanity connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateSanityConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_sanity_connection_payload",
      "Sanity connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

function canReadSanity(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteSanity(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "provider_credentials:write");
}

function mapCreateError(c: Parameters<typeof badRequestResponse>[0], error: unknown) {
  if (!(error instanceof Error)) {
    return badRequestResponse(c, "sanity_connection_create_failed");
  }

  switch (error.message) {
    case "sanity_api_key_not_found":
      return notFoundResponse(c, error.message, "API key was not found for this workspace.");
    case "sanity_api_key_missing_permissions":
      return badRequestResponse(
        c,
        error.message,
        "API key must include files:read, files:write, jobs:read, and jobs:write permissions.",
      );
    case "sanity_project_not_found":
      return notFoundResponse(c, error.message, "Project was not found for this workspace.");
    case "sanity_project_source_locale_missing":
      return badRequestResponse(
        c,
        error.message,
        "The selected project must have a source locale.",
      );
    default:
      return badRequestResponse(c, "sanity_connection_create_failed");
  }
}

export function createSanityConnectionRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadSanity(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const sanityConnections = await listSanityConnections({
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.json({ sanityConnections }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      if (!canWriteSanity(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");

      try {
        const result = await createSanityConnection({
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          displayName: payload.displayName,
          apiKeyId: payload.apiKeyId,
          enabled: payload.enabled,
        });

        serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.integrationConnected, {
          status: "created",
          source: "sanity",
        });
        await enqueueIntegrationConnectedActivity({
          ...sessionActivityActor(c.var.auth.user.localUserId),
          connectionId: result.connection.id,
          integrationKind: "sanity-plugin",
          organizationId: c.var.auth.organization.localOrganizationId,
        });

        return c.json({ sanityConnection: result.connection }, 201);
      } catch (error) {
        return mapCreateError(c, error);
      }
    })
    .get("/:connectionId", validateConnectionIdParams, async (c) => {
      if (!canReadSanity(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const sanityConnection = await getSanityConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId: params.connectionId,
      });

      if (!sanityConnection) {
        return notFoundResponse(c, "sanity_connection_not_found");
      }

      return c.json({ sanityConnection }, 200);
    })
    .patch("/:connectionId", validateConnectionIdParams, validateUpdateBody, async (c) => {
      if (!canWriteSanity(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const payload = c.req.valid("json");

      try {
        const sanityConnection = await updateSanityConnection({
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          connectionId: params.connectionId,
          ...payload,
        });

        if (!sanityConnection) {
          return notFoundResponse(c, "sanity_connection_not_found");
        }

        return c.json({ sanityConnection }, 200);
      } catch (error) {
        return mapCreateError(c, error);
      }
    })
    .delete("/:connectionId", validateConnectionIdParams, async (c) => {
      if (!canWriteSanity(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const deleted = await deleteSanityConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId: params.connectionId,
      });

      if (!deleted) {
        return notFoundResponse(c, "sanity_connection_not_found");
      }

      await enqueueIntegrationDisconnectedActivity({
        ...sessionActivityActor(c.var.auth.user.localUserId),
        connectionId: params.connectionId,
        integrationKind: "sanity-plugin",
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.body(null, 204);
    });
}
