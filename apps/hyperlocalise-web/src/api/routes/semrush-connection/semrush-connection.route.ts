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
  createSemrushConnection,
  deleteSemrushConnection,
  getSemrushConnection,
  listSemrushConnections,
  updateSemrushConnection,
} from "@/lib/semrush/connections";
import type { SemrushConnectionError } from "@/lib/semrush/types";
import { isErr } from "@/lib/primitives/result/results";

import {
  createSemrushConnectionBodySchema,
  semrushConnectionIdParamSchema,
  updateSemrushConnectionBodySchema,
} from "./semrush-connection.schema";

const validateConnectionParams = validator("param", (value, c) => {
  const parsed = semrushConnectionIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_semrush_connection_id");
  }
  return parsed.data;
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createSemrushConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_semrush_connection_payload",
      "Semrush connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateSemrushConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_semrush_connection_payload",
      "Semrush connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

function canReadSemrush(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteSemrush(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "provider_credentials:write");
}

function mapSemrushConnectionError(
  c: Parameters<typeof badRequestResponse>[0],
  error: SemrushConnectionError,
) {
  switch (error.code) {
    case "semrush_connection_not_found":
      return notFoundResponse(c, error.code, error.message);
    default:
      return badRequestResponse(c, error.code, error.message);
  }
}

export function createSemrushConnectionRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadSemrush(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const semrushConnections = await listSemrushConnections({
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.json({ semrushConnections }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      if (!canWriteSemrush(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const body = c.req.valid("json");
      const result = await createSemrushConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        displayName: body.displayName,
        apiKey: body.apiKey,
        enabled: body.enabled ?? true,
        validate: body.validate === true,
      });

      if (isErr(result)) {
        return mapSemrushConnectionError(c, result.error);
      }

      return c.json({ semrushConnection: result.value }, 201);
    })
    .get("/:connectionId", validateConnectionParams, async (c) => {
      if (!canReadSemrush(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { connectionId } = c.req.valid("param");
      const semrushConnection = await getSemrushConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });

      if (!semrushConnection) {
        return notFoundResponse(c, "semrush_connection_not_found");
      }

      return c.json({ semrushConnection }, 200);
    })
    .patch("/:connectionId", validateConnectionParams, validateUpdateBody, async (c) => {
      if (!canWriteSemrush(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { connectionId } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await updateSemrushConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        connectionId,
        displayName: body.displayName,
        apiKey: body.apiKey,
        enabled: body.enabled,
        validate: body.validate,
      });

      if (isErr(result)) {
        return mapSemrushConnectionError(c, result.error);
      }

      if (!result.value) {
        return notFoundResponse(c, "semrush_connection_not_found");
      }

      return c.json({ semrushConnection: result.value }, 200);
    })
    .delete("/:connectionId", validateConnectionParams, async (c) => {
      if (!canWriteSemrush(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { connectionId } = c.req.valid("param");
      const deleted = await deleteSemrushConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });

      if (!deleted) {
        return notFoundResponse(c, "semrush_connection_not_found");
      }

      return c.body(null, 204);
    });
}
