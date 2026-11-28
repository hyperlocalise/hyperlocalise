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
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  serviceUnavailableResponse,
  conflictResponse,
} from "@/api/response.schema";
import {
  withWorkspaceResourceLimit,
  workspaceResourceFeatureIds,
  workspaceResourceLimitErrorDetails,
  workspaceResourceLimitMessage,
  type WorkspaceResourceLimitError,
} from "@/lib/billing/workspace-resource-limits";
import { isErr } from "@/lib/primitives/result/results";
import {
  createStoryblokConnection,
  deleteStoryblokConnection,
  discoverStoryblokConnection,
  getStoryblokConnection,
  listStoryblokConnections,
  updateStoryblokConnection,
  validateStoryblokConnectionRecord,
} from "@/lib/storyblok/connections";

import {
  createStoryblokConnectionBodySchema,
  discoverStoryblokSpaceBodySchema,
  updateStoryblokConnectionBodySchema,
  storyblokConnectionIdParamSchema,
} from "./storyblok-connection.schema";

function canReadStoryblok(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteStoryblok(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:write");
}

const validateConnectionParams = validator("param", (value, c) => {
  const parsed = storyblokConnectionIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_storyblok_connection_id");
  }
  return parsed.data;
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createStoryblokConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_storyblok_connection_payload");
  }
  return parsed.data;
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateStoryblokConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_storyblok_connection_payload");
  }
  return parsed.data;
});

const validateDiscoverBody = validator("json", (value, c) => {
  const parsed = discoverStoryblokSpaceBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_storyblok_discover_payload");
  }
  return parsed.data;
});

function mapWorkspaceResourceLimitError(
  c: Parameters<typeof conflictResponse>[0],
  error: WorkspaceResourceLimitError,
) {
  if (error.code === "workspace_resource_limit_check_failed") {
    return serviceUnavailableResponse(
      c,
      error.code,
      "Unable to verify integration limits. Try again later.",
    );
  }

  return conflictResponse(
    c,
    error.code,
    workspaceResourceLimitMessage(error.featureId),
    workspaceResourceLimitErrorDetails(error),
  );
}

export function createStoryblokConnectionRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadStoryblok(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const storyblokConnections = await listStoryblokConnections({
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.json({ storyblokConnections }, 200);
    })
    .post("/discover", validateDiscoverBody, async (c) => {
      if (!canReadStoryblok(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      const result = await discoverStoryblokConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        region: payload.region,
        spaceId: payload.spaceId,
        accessToken: payload.accessToken,
        connectionId: payload.connectionId,
      });

      if (isErr(result)) {
        return badRequestResponse(c, result.error.code, result.error.message);
      }

      return c.json({ storyblokDiscovery: result.value }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      if (!canWriteStoryblok(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const workosUserId = c.var.auth.user.workosUserId;
      if (!workosUserId) {
        return badRequestResponse(c, "storyblok_workos_user_required");
      }

      const connectionInput = {
        organizationId,
        userId: c.var.auth.user.localUserId,
        workosUserId,
        workosOrganizationId: c.var.auth.organization.workosOrganizationId,
        displayName: payload.displayName,
        spaceId: payload.spaceId,
        region: payload.region,
        folderSlugs: payload.folderSlugs,
        accessToken: payload.accessToken,
        enabled: payload.enabled,
      };

      let createResult;
      if (payload.enabled) {
        const limitResult = await withWorkspaceResourceLimit(
          {
            organizationId,
            featureId: workspaceResourceFeatureIds.integrations,
            analyticsSource: "storyblok",
          },
          (tx) => createStoryblokConnection({ ...connectionInput, db: tx }),
        );
        if (!limitResult.ok) {
          return mapWorkspaceResourceLimitError(c, limitResult.error);
        }
        createResult = limitResult.value;
      } else {
        createResult = await createStoryblokConnection(connectionInput);
      }

      if (isErr(createResult)) {
        return badRequestResponse(c, createResult.error.code, createResult.error.message);
      }

      return c.json({ storyblokConnection: createResult.value }, 201);
    })
    .get("/:connectionId", validateConnectionParams, async (c) => {
      if (!canReadStoryblok(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { connectionId } = c.req.valid("param");
      const storyblokConnection = await getStoryblokConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });
      if (!storyblokConnection) {
        return notFoundResponse(c, "storyblok_connection_not_found");
      }

      return c.json({ storyblokConnection }, 200);
    })
    .patch("/:connectionId", validateConnectionParams, validateUpdateBody, async (c) => {
      if (!canWriteStoryblok(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { connectionId } = c.req.valid("param");
      const payload = c.req.valid("json");
      const workosUserId = c.var.auth.user.workosUserId;
      if (!workosUserId) {
        return badRequestResponse(c, "storyblok_workos_user_required");
      }

      const organizationId = c.var.auth.organization.localOrganizationId;
      const updateInput = {
        organizationId,
        userId: c.var.auth.user.localUserId,
        workosUserId,
        workosOrganizationId: c.var.auth.organization.workosOrganizationId,
        connectionId,
        displayName: payload.displayName,
        spaceId: payload.spaceId,
        region: payload.region,
        folderSlugs: payload.folderSlugs,
        accessToken: payload.accessToken,
        enabled: payload.enabled,
      };

      let storyblokConnection;
      if (payload.enabled === true) {
        // Activating a connection consumes integration quota, so apply the
        // same limit check as create. Only check on a disabled -> enabled
        // transition to avoid rejecting edits to already-enabled rows.
        const existing = await getStoryblokConnection({ organizationId, connectionId });
        if (!existing) {
          return notFoundResponse(c, "storyblok_connection_not_found");
        }
        if (existing.enabled !== true) {
          const limitResult = await withWorkspaceResourceLimit(
            {
              organizationId,
              featureId: workspaceResourceFeatureIds.integrations,
              analyticsSource: "storyblok",
            },
            (tx) => updateStoryblokConnection({ ...updateInput, db: tx }),
          );
          if (!limitResult.ok) {
            return mapWorkspaceResourceLimitError(c, limitResult.error);
          }
          storyblokConnection = limitResult.value;
        } else {
          storyblokConnection = await updateStoryblokConnection(updateInput);
        }
      } else {
        storyblokConnection = await updateStoryblokConnection(updateInput);
      }

      if (isErr(storyblokConnection)) {
        return badRequestResponse(
          c,
          storyblokConnection.error.code,
          storyblokConnection.error.message,
        );
      }
      if (!storyblokConnection.value) {
        return notFoundResponse(c, "storyblok_connection_not_found");
      }

      return c.json({ storyblokConnection: storyblokConnection.value }, 200);
    })
    .delete("/:connectionId", validateConnectionParams, async (c) => {
      if (!canWriteStoryblok(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { connectionId } = c.req.valid("param");
      const deleted = await deleteStoryblokConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });
      if (!deleted) {
        return notFoundResponse(c, "storyblok_connection_not_found");
      }

      return c.body(null, 204);
    })
    .post("/:connectionId/validate", validateConnectionParams, async (c) => {
      if (!canWriteStoryblok(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { connectionId } = c.req.valid("param");
      const storyblokConnection = await validateStoryblokConnectionRecord({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });
      if (!storyblokConnection) {
        return notFoundResponse(c, "storyblok_connection_not_found");
      }

      return c.json({ storyblokConnection }, 200);
    });
}
