import { Hono } from "hono";
import { validator } from "hono/validator";

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { badRequestResponse, forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import {
  createCanvaConnection,
  deleteCanvaConnection,
  getCanvaConnection,
  listCanvaConnections,
  regenerateCanvaConnectionToken,
  updateCanvaConnection,
} from "@/lib/canva/connections";

import {
  canvaConnectionIdParamSchema,
  createCanvaConnectionBodySchema,
  updateCanvaConnectionBodySchema,
} from "./canva-connection.schema";

const validateConnectionIdParams = validator("param", (value, c) => {
  const parsed = canvaConnectionIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return notFoundResponse(c, "canva_connection_not_found");
  }
  return parsed.data;
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createCanvaConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_canva_connection_payload",
      "Canva connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateCanvaConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_canva_connection_payload",
      "Canva connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

function canReadCanva(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteCanva(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "provider_credentials:write");
}

function mapCreateError(c: Parameters<typeof badRequestResponse>[0], error: unknown) {
  if (!(error instanceof Error)) {
    return badRequestResponse(c, "canva_connection_create_failed");
  }

  switch (error.message) {
    case "canva_api_key_not_found":
      return notFoundResponse(c, error.message, "API key was not found for this workspace.");
    case "canva_api_key_missing_permissions":
      return badRequestResponse(
        c,
        error.message,
        "API key must include files:read, files:write, jobs:read, and jobs:write permissions.",
      );
    case "canva_project_not_found":
      return notFoundResponse(c, error.message, "Project was not found for this workspace.");
    default:
      return badRequestResponse(c, "canva_connection_create_failed");
  }
}

export function createCanvaConnectionRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadCanva(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const canvaConnections = await listCanvaConnections({
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.json({ canvaConnections }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      if (!canWriteCanva(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");

      try {
        const result = await createCanvaConnection({
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          displayName: payload.displayName,
          apiKeyId: payload.apiKeyId,
          projectId: payload.projectId,
          sourceLocale: payload.sourceLocale,
          targetLocales: payload.targetLocales,
          enabled: payload.enabled,
        });

        return c.json(
          {
            canvaConnection: result.connection,
            connectionToken: result.connectionToken,
          },
          201,
        );
      } catch (error) {
        return mapCreateError(c, error);
      }
    })
    .get("/:connectionId", validateConnectionIdParams, async (c) => {
      if (!canReadCanva(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const canvaConnection = await getCanvaConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId: params.connectionId,
      });

      if (!canvaConnection) {
        return notFoundResponse(c, "canva_connection_not_found");
      }

      return c.json({ canvaConnection }, 200);
    })
    .patch("/:connectionId", validateConnectionIdParams, validateUpdateBody, async (c) => {
      if (!canWriteCanva(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const payload = c.req.valid("json");

      try {
        const canvaConnection = await updateCanvaConnection({
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          connectionId: params.connectionId,
          ...payload,
        });

        if (!canvaConnection) {
          return notFoundResponse(c, "canva_connection_not_found");
        }

        return c.json({ canvaConnection }, 200);
      } catch (error) {
        return mapCreateError(c, error);
      }
    })
    .delete("/:connectionId", validateConnectionIdParams, async (c) => {
      if (!canWriteCanva(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const deleted = await deleteCanvaConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId: params.connectionId,
      });

      if (!deleted) {
        return notFoundResponse(c, "canva_connection_not_found");
      }

      return c.body(null, 204);
    })
    .post("/:connectionId/regenerate-token", validateConnectionIdParams, async (c) => {
      if (!canWriteCanva(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const result = await regenerateCanvaConnectionToken({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        connectionId: params.connectionId,
      });

      if (!result) {
        return notFoundResponse(c, "canva_connection_not_found");
      }

      return c.json(
        {
          canvaConnection: result.connection,
          connectionToken: result.connectionToken,
        },
        200,
      );
    });
}
