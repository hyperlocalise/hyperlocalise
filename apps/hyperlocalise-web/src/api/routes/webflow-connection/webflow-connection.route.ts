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
  createWebflowConnection,
  deleteWebflowConnection,
  discoverWebflowConnection,
  getWebflowConnection,
  listWebflowConnections,
  updateWebflowConnection,
  validateWebflowConnectionRecord,
} from "@/lib/webflow/connections";

import {
  createWebflowConnectionBodySchema,
  discoverWebflowSiteBodySchema,
  updateWebflowConnectionBodySchema,
  webflowConnectionIdParamSchema,
} from "./webflow-connection.schema";

function canReadWebflow(role: string) {
  return hasCapability(role, "integrations:read");
}

function canWriteWebflow(role: string) {
  return hasCapability(role, "integrations:write");
}

const validateConnectionParams = validator("param", (value, c) => {
  const parsed = webflowConnectionIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_webflow_connection_id");
  }
  return parsed.data;
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createWebflowConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_webflow_connection_payload");
  }
  return parsed.data;
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateWebflowConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_webflow_connection_payload");
  }
  return parsed.data;
});

const validateDiscoverBody = validator("json", (value, c) => {
  const parsed = discoverWebflowSiteBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_webflow_discover_payload");
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

export function createWebflowConnectionRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadWebflow(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const webflowConnections = await listWebflowConnections({
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.json({ webflowConnections }, 200);
    })
    .post("/discover", validateDiscoverBody, async (c) => {
      if (!canReadWebflow(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      const workosUserId = c.var.auth.user.workosUserId;
      if (!workosUserId) {
        return badRequestResponse(c, "webflow_workos_user_required");
      }

      const result = await discoverWebflowConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        workosUserId,
        siteId: payload.siteId,
        siteToken: payload.siteToken,
        connectionId: payload.connectionId,
      });

      if (isErr(result)) {
        return badRequestResponse(c, result.error.code, result.error.message);
      }

      return c.json({ webflowDiscovery: result.value }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      if (!canWriteWebflow(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const workosUserId = c.var.auth.user.workosUserId;
      if (!workosUserId) {
        return badRequestResponse(c, "webflow_workos_user_required");
      }

      const connectionInput = {
        organizationId,
        userId: c.var.auth.user.localUserId,
        workosUserId,
        workosOrganizationId: c.var.auth.organization.workosOrganizationId,
        displayName: payload.displayName,
        siteId: payload.siteId,
        collectionIds: payload.collectionIds,
        siteToken: payload.siteToken,
        enabled: payload.enabled,
      };

      let createResult;
      if (payload.enabled) {
        const limitResult = await withWorkspaceResourceLimit(
          {
            organizationId,
            featureId: workspaceResourceFeatureIds.integrations,
            analyticsSource: "webflow",
          },
          (tx) => createWebflowConnection({ ...connectionInput, db: tx }),
        );
        if (!limitResult.ok) {
          return mapWorkspaceResourceLimitError(c, limitResult.error);
        }
        createResult = limitResult.value;
      } else {
        createResult = await createWebflowConnection(connectionInput);
      }

      if (isErr(createResult)) {
        return badRequestResponse(c, createResult.error.code, createResult.error.message);
      }

      return c.json({ webflowConnection: createResult.value }, 201);
    })
    .get("/:connectionId", validateConnectionParams, async (c) => {
      if (!canReadWebflow(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { connectionId } = c.req.valid("param");
      const webflowConnection = await getWebflowConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });
      if (!webflowConnection) {
        return notFoundResponse(c, "webflow_connection_not_found");
      }

      return c.json({ webflowConnection }, 200);
    })
    .patch("/:connectionId", validateConnectionParams, validateUpdateBody, async (c) => {
      if (!canWriteWebflow(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { connectionId } = c.req.valid("param");
      const payload = c.req.valid("json");
      const workosUserId = c.var.auth.user.workosUserId;
      if (!workosUserId) {
        return badRequestResponse(c, "webflow_workos_user_required");
      }

      const webflowConnection = await updateWebflowConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        workosUserId,
        workosOrganizationId: c.var.auth.organization.workosOrganizationId,
        connectionId,
        displayName: payload.displayName,
        siteId: payload.siteId,
        collectionIds: payload.collectionIds,
        siteToken: payload.siteToken,
        enabled: payload.enabled,
      });

      if (!webflowConnection) {
        return notFoundResponse(c, "webflow_connection_not_found");
      }

      return c.json({ webflowConnection }, 200);
    })
    .delete("/:connectionId", validateConnectionParams, async (c) => {
      if (!canWriteWebflow(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { connectionId } = c.req.valid("param");
      const deleted = await deleteWebflowConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });
      if (!deleted) {
        return notFoundResponse(c, "webflow_connection_not_found");
      }

      return c.body(null, 204);
    })
    .post("/:connectionId/validate", validateConnectionParams, async (c) => {
      if (!canWriteWebflow(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { connectionId } = c.req.valid("param");
      const webflowConnection = await validateWebflowConnectionRecord({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });
      if (!webflowConnection) {
        return notFoundResponse(c, "webflow_connection_not_found");
      }

      return c.json({ webflowConnection }, 200);
    });
}
