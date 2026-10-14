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
  enqueueIntegrationCredentialRotatedActivity,
  enqueueIntegrationDisconnectedActivity,
} from "@/lib/activity-log/integration-events";
import { sessionActivityActor } from "@/lib/activity-log/file-segment-events";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import {
  createFigmaConnection,
  deleteFigmaConnection,
  getFigmaConnection,
  listFigmaConnections,
  regenerateFigmaConnectionToken,
  updateFigmaConnection,
} from "@/lib/figma/connections";

import {
  figmaConnectionIdParamSchema,
  createFigmaConnectionBodySchema,
  updateFigmaConnectionBodySchema,
} from "./figma-connection.schema";

const validateConnectionIdParams = validator("param", (value, c) => {
  const parsed = figmaConnectionIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return notFoundResponse(c, "figma_connection_not_found");
  }
  return parsed.data;
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createFigmaConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_figma_connection_payload",
      "Figma connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateFigmaConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_figma_connection_payload",
      "Figma connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

function canReadFigma(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteFigma(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "provider_credentials:write");
}

function mapCreateError(c: Parameters<typeof badRequestResponse>[0], error: unknown) {
  if (!(error instanceof Error)) {
    return badRequestResponse(c, "figma_connection_create_failed");
  }

  switch (error.message) {
    case "figma_api_key_not_found":
      return notFoundResponse(c, error.message, "API key was not found for this workspace.");
    case "figma_api_key_missing_permissions":
      return badRequestResponse(
        c,
        error.message,
        "API key must include files:read, files:write, jobs:read, and jobs:write permissions.",
      );
    case "figma_project_not_found":
      return notFoundResponse(c, error.message, "Project was not found for this workspace.");
    case "figma_project_source_locale_missing":
      return badRequestResponse(
        c,
        error.message,
        "The selected project must have a source locale.",
      );
    default:
      return badRequestResponse(c, "figma_connection_create_failed");
  }
}

export function createFigmaConnectionRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadFigma(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const figmaConnections = await listFigmaConnections({
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.json({ figmaConnections }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      if (!canWriteFigma(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");

      try {
        const result = await createFigmaConnection({
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          displayName: payload.displayName,
          apiKeyId: payload.apiKeyId,
          projectId: payload.projectId,
          enabled: payload.enabled,
        });

        serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.integrationConnected, {
          status: "created",
          source: "figma",
        });
        await enqueueIntegrationConnectedActivity({
          ...sessionActivityActor(c.var.auth.user.localUserId),
          connectionId: result.connection.id,
          integrationKind: "figma",
          organizationId: c.var.auth.organization.localOrganizationId,
        });

        return c.json(
          {
            figmaConnection: result.connection,
            connectionToken: result.connectionToken,
          },
          201,
        );
      } catch (error) {
        return mapCreateError(c, error);
      }
    })
    .get("/:connectionId", validateConnectionIdParams, async (c) => {
      if (!canReadFigma(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const figmaConnection = await getFigmaConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId: params.connectionId,
      });

      if (!figmaConnection) {
        return notFoundResponse(c, "figma_connection_not_found");
      }

      return c.json({ figmaConnection }, 200);
    })
    .patch("/:connectionId", validateConnectionIdParams, validateUpdateBody, async (c) => {
      if (!canWriteFigma(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const payload = c.req.valid("json");

      try {
        const figmaConnection = await updateFigmaConnection({
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          connectionId: params.connectionId,
          ...payload,
        });

        if (!figmaConnection) {
          return notFoundResponse(c, "figma_connection_not_found");
        }

        return c.json({ figmaConnection }, 200);
      } catch (error) {
        return mapCreateError(c, error);
      }
    })
    .delete("/:connectionId", validateConnectionIdParams, async (c) => {
      if (!canWriteFigma(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const deleted = await deleteFigmaConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId: params.connectionId,
      });

      if (!deleted) {
        return notFoundResponse(c, "figma_connection_not_found");
      }

      await enqueueIntegrationDisconnectedActivity({
        ...sessionActivityActor(c.var.auth.user.localUserId),
        connectionId: params.connectionId,
        integrationKind: "figma",
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.body(null, 204);
    })
    .post("/:connectionId/regenerate-token", validateConnectionIdParams, async (c) => {
      if (!canWriteFigma(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const result = await regenerateFigmaConnectionToken({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        connectionId: params.connectionId,
      });

      if (!result) {
        return notFoundResponse(c, "figma_connection_not_found");
      }

      await enqueueIntegrationCredentialRotatedActivity({
        ...sessionActivityActor(c.var.auth.user.localUserId),
        connectionId: params.connectionId,
        integrationKind: "figma",
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.json(
        {
          figmaConnection: result.connection,
          connectionToken: result.connectionToken,
        },
        200,
      );
    });
}
