import { Hono } from "hono";
import { validator } from "hono/validator";

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { badRequestResponse, forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import {
  createContentfulConnection,
  deleteContentfulConnection,
  getContentfulConnection,
  listContentfulConnections,
  updateContentfulConnection,
  validateContentfulConnection,
} from "@/lib/contentful/connections";

import {
  contentfulConnectionIdParamSchema,
  createContentfulConnectionBodySchema,
  updateContentfulConnectionBodySchema,
} from "./contentful-connection.schema";

const validateConnectionParams = validator("param", (value, c) => {
  const parsed = contentfulConnectionIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_contentful_connection_id");
  }
  return parsed.data;
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createContentfulConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_contentful_connection_payload",
      "Contentful connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateContentfulConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_contentful_connection_payload",
      "Contentful connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

function canReadContentful(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteContentful(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "provider_credentials:write");
}

function mapContentfulError(c: Parameters<typeof badRequestResponse>[0], error: unknown) {
  if (error instanceof Error && error.message === "project_not_found") {
    return notFoundResponse(c, "project_not_found");
  }
  throw error;
}

export function createContentfulConnectionRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadContentful(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const contentfulConnections = await listContentfulConnections({
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.json({ contentfulConnections }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      if (!canWriteContentful(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      try {
        const payload = c.req.valid("json");
        const result = await createContentfulConnection({
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          projectId: payload.projectId,
          displayName: payload.displayName,
          spaceId: payload.spaceId,
          environmentId: payload.environmentId,
          sourceLocale: payload.sourceLocale,
          targetLocales: payload.targetLocales,
          contentTypeIds: payload.contentTypeIds,
          fieldConfig: payload.fieldConfig,
          accessToken: payload.accessToken,
          enabled: payload.enabled,
        });

        return c.json(
          {
            contentfulConnection: result.connection,
            webhookSecret: result.webhookSecret,
          },
          201,
        );
      } catch (error) {
        return mapContentfulError(c, error);
      }
    })
    .get("/:connectionId", validateConnectionParams, async (c) => {
      if (!canReadContentful(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { connectionId } = c.req.valid("param");
      const contentfulConnection = await getContentfulConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });
      if (!contentfulConnection) {
        return notFoundResponse(c, "contentful_connection_not_found");
      }

      return c.json({ contentfulConnection }, 200);
    })
    .patch("/:connectionId", validateConnectionParams, validateUpdateBody, async (c) => {
      if (!canWriteContentful(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      try {
        const { connectionId } = c.req.valid("param");
        const payload = c.req.valid("json");
        const result = await updateContentfulConnection({
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          connectionId,
          projectId: payload.projectId,
          displayName: payload.displayName,
          spaceId: payload.spaceId,
          environmentId: payload.environmentId,
          sourceLocale: payload.sourceLocale,
          targetLocales: payload.targetLocales,
          contentTypeIds: payload.contentTypeIds,
          fieldConfig: payload.fieldConfig,
          accessToken: payload.accessToken,
          enabled: payload.enabled,
        });
        if (!result) {
          return notFoundResponse(c, "contentful_connection_not_found");
        }

        return c.json(
          {
            contentfulConnection: result.connection,
            webhookSecret: result.webhookSecret,
          },
          200,
        );
      } catch (error) {
        return mapContentfulError(c, error);
      }
    })
    .delete("/:connectionId", validateConnectionParams, async (c) => {
      if (!canWriteContentful(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { connectionId } = c.req.valid("param");
      const deleted = await deleteContentfulConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });
      if (!deleted) {
        return notFoundResponse(c, "contentful_connection_not_found");
      }

      return c.body(null, 204);
    })
    .post("/:connectionId/validate", validateConnectionParams, async (c) => {
      if (!canWriteContentful(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const { connectionId } = c.req.valid("param");
      const result = await validateContentfulConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });
      if (!result) {
        return notFoundResponse(c, "contentful_connection_not_found");
      }

      return c.json({ contentfulConnectionValidation: result }, result.ok ? 200 : 400);
    });
}
