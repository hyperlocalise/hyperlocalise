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
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
} from "@/api/response.schema";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import {
  createZernioConnection,
  deleteZernioConnection,
  getZernioConnection,
  listZernioConnections,
  updateZernioConnection,
} from "@/lib/zernio/connections";
import type { ZernioConnectionError } from "@/lib/zernio/types";
import { isErr } from "@/lib/primitives/result/results";

import {
  createZernioConnectionBodySchema,
  updateZernioConnectionBodySchema,
  zernioConnectionIdParamSchema,
} from "./zernio-connection.schema";

const validateConnectionParams = validator("param", (value, c) => {
  const parsed = zernioConnectionIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_zernio_connection_id");
  }
  return parsed.data;
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createZernioConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_zernio_connection_payload",
      "Zernio connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateZernioConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_zernio_connection_payload",
      "Zernio connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

function canReadZernio(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteZernio(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "provider_credentials:write");
}

function mapZernioConnectionError(
  c: Parameters<typeof badRequestResponse>[0],
  error: ZernioConnectionError,
) {
  switch (error.code) {
    case "zernio_connection_not_found":
      return notFoundResponse(c, error.code, error.message);
    case "zernio_connection_in_use":
      return conflictResponse(c, error.code, error.message);
    default:
      return badRequestResponse(c, error.code, error.message);
  }
}

export function createZernioConnectionRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadZernio(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const zernioConnections = await listZernioConnections({
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.json({ zernioConnections }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      if (!canWriteZernio(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const body = c.req.valid("json");
      const result = await createZernioConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        displayName: body.displayName,
        apiKey: body.apiKey,
        enabled: body.enabled ?? true,
        validate: body.validate !== false,
      });

      if (isErr(result)) {
        return mapZernioConnectionError(c, result.error);
      }

      serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.integrationConnected, {
        status: "created",
        source: "zernio",
      });

      return c.json({ zernioConnection: result.value }, 201);
    })
    .get("/:connectionId", validateConnectionParams, async (c) => {
      if (!canReadZernio(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { connectionId } = c.req.valid("param");
      const zernioConnection = await getZernioConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });

      if (!zernioConnection) {
        return notFoundResponse(c, "zernio_connection_not_found");
      }

      return c.json({ zernioConnection }, 200);
    })
    .patch("/:connectionId", validateConnectionParams, validateUpdateBody, async (c) => {
      if (!canWriteZernio(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { connectionId } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await updateZernioConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        connectionId,
        displayName: body.displayName,
        apiKey: body.apiKey,
        enabled: body.enabled,
        validate: body.apiKey !== undefined ? body.validate !== false : body.validate,
      });

      if (isErr(result)) {
        return mapZernioConnectionError(c, result.error);
      }

      if (!result.value) {
        return notFoundResponse(c, "zernio_connection_not_found");
      }

      return c.json({ zernioConnection: result.value }, 200);
    })
    .delete("/:connectionId", validateConnectionParams, async (c) => {
      if (!canWriteZernio(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { connectionId } = c.req.valid("param");
      const result = await deleteZernioConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });

      if (isErr(result)) {
        return mapZernioConnectionError(c, result.error);
      }

      if (!result.value) {
        return notFoundResponse(c, "zernio_connection_not_found");
      }

      return c.body(null, 204);
    });
}
