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
import {
  createAhrefsConnection,
  deleteAhrefsConnection,
  getAhrefsConnection,
  listAhrefsConnections,
  updateAhrefsConnection,
} from "@/lib/ahrefs/connections";
import type { AhrefsConnectionError } from "@/lib/ahrefs/types";
import { isErr } from "@/lib/primitives/result/results";

import {
  ahrefsConnectionIdParamSchema,
  createAhrefsConnectionBodySchema,
  updateAhrefsConnectionBodySchema,
} from "./ahrefs-connection.schema";

const validateConnectionParams = validator("param", (value, c) => {
  const parsed = ahrefsConnectionIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_ahrefs_connection_id");
  }
  return parsed.data;
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createAhrefsConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_ahrefs_connection_payload",
      "Ahrefs connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateAhrefsConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_ahrefs_connection_payload",
      "Ahrefs connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

function canReadAhrefs(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteAhrefs(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "provider_credentials:write");
}

function mapAhrefsConnectionError(
  c: Parameters<typeof badRequestResponse>[0],
  error: AhrefsConnectionError,
) {
  switch (error.code) {
    case "ahrefs_connection_not_found":
      return notFoundResponse(c, error.code, error.message);
    case "ahrefs_connection_in_use":
      return conflictResponse(c, error.code, error.message);
    default:
      return badRequestResponse(c, error.code, error.message);
  }
}

export function createAhrefsConnectionRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadAhrefs(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const ahrefsConnections = await listAhrefsConnections({
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.json({ ahrefsConnections }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      if (!canWriteAhrefs(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const body = c.req.valid("json");
      const result = await createAhrefsConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        displayName: body.displayName,
        apiKey: body.apiKey,
        enabled: body.enabled ?? true,
        // Default true so mistyped keys never become selectable automation tools.
        validate: body.validate !== false,
      });

      if (isErr(result)) {
        return mapAhrefsConnectionError(c, result.error);
      }

      return c.json({ ahrefsConnection: result.value }, 201);
    })
    .get("/:connectionId", validateConnectionParams, async (c) => {
      if (!canReadAhrefs(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { connectionId } = c.req.valid("param");
      const ahrefsConnection = await getAhrefsConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });

      if (!ahrefsConnection) {
        return notFoundResponse(c, "ahrefs_connection_not_found");
      }

      return c.json({ ahrefsConnection }, 200);
    })
    .patch("/:connectionId", validateConnectionParams, validateUpdateBody, async (c) => {
      if (!canWriteAhrefs(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { connectionId } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await updateAhrefsConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        connectionId,
        displayName: body.displayName,
        apiKey: body.apiKey,
        enabled: body.enabled,
        validate: body.apiKey !== undefined ? body.validate !== false : body.validate,
      });

      if (isErr(result)) {
        return mapAhrefsConnectionError(c, result.error);
      }

      if (!result.value) {
        return notFoundResponse(c, "ahrefs_connection_not_found");
      }

      return c.json({ ahrefsConnection: result.value }, 200);
    })
    .delete("/:connectionId", validateConnectionParams, async (c) => {
      if (!canWriteAhrefs(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { connectionId } = c.req.valid("param");
      const result = await deleteAhrefsConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });

      if (isErr(result)) {
        return mapAhrefsConnectionError(c, result.error);
      }

      if (!result.value) {
        return notFoundResponse(c, "ahrefs_connection_not_found");
      }

      return c.body(null, 204);
    });
}
