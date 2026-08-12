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
  createIntercomConnection,
  deleteIntercomConnection,
  getIntercomConnection,
  listIntercomConnections,
  updateIntercomConnection,
} from "@/lib/intercom/connections";
import type { IntercomConnectionError } from "@/lib/intercom/types";
import { isErr } from "@/lib/primitives/result/results";

import {
  createIntercomConnectionBodySchema,
  intercomConnectionIdParamSchema,
  updateIntercomConnectionBodySchema,
} from "./intercom-connection.schema";

const validateConnectionParams = validator("param", (value, c) => {
  const parsed = intercomConnectionIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_intercom_connection_id");
  }
  return parsed.data;
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createIntercomConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_intercom_connection_payload",
      "Intercom connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateIntercomConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_intercom_connection_payload",
      "Intercom connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

function canReadIntercom(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteIntercom(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "provider_credentials:write");
}

function mapIntercomConnectionError(
  c: Parameters<typeof badRequestResponse>[0],
  error: IntercomConnectionError,
) {
  switch (error.code) {
    case "intercom_connection_not_found":
      return notFoundResponse(c, error.code, error.message);
    default:
      return badRequestResponse(c, error.code, error.message);
  }
}

export function createIntercomConnectionRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadIntercom(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const intercomConnections = await listIntercomConnections({
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.json({ intercomConnections }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      if (!canWriteIntercom(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const body = c.req.valid("json");
      const result = await createIntercomConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        displayName: body.displayName,
        accessToken: body.accessToken,
        restEndpoint: body.restEndpoint,
        enabled: body.enabled ?? true,
        validate: body.validate !== false,
      });

      if (isErr(result)) {
        return mapIntercomConnectionError(c, result.error);
      }

      return c.json({ intercomConnection: result.value }, 201);
    })
    .get("/:connectionId", validateConnectionParams, async (c) => {
      if (!canReadIntercom(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { connectionId } = c.req.valid("param");
      const intercomConnection = await getIntercomConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });

      if (!intercomConnection) {
        return notFoundResponse(c, "intercom_connection_not_found");
      }

      return c.json({ intercomConnection }, 200);
    })
    .patch("/:connectionId", validateConnectionParams, validateUpdateBody, async (c) => {
      if (!canWriteIntercom(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { connectionId } = c.req.valid("param");
      const body = c.req.valid("json");
      const shouldValidateCredentials =
        body.accessToken !== undefined || body.restEndpoint !== undefined;
      const result = await updateIntercomConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        connectionId,
        displayName: body.displayName,
        accessToken: body.accessToken,
        restEndpoint: body.restEndpoint,
        enabled: body.enabled,
        validate: shouldValidateCredentials ? body.validate !== false : body.validate,
      });

      if (isErr(result)) {
        return mapIntercomConnectionError(c, result.error);
      }

      if (!result.value) {
        return notFoundResponse(c, "intercom_connection_not_found");
      }

      return c.json({ intercomConnection: result.value }, 200);
    })
    .delete("/:connectionId", validateConnectionParams, async (c) => {
      if (!canWriteIntercom(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { connectionId } = c.req.valid("param");
      const deleted = await deleteIntercomConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });

      if (!deleted) {
        return notFoundResponse(c, "intercom_connection_not_found");
      }

      return c.body(null, 204);
    });
}
