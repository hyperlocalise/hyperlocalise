import { Hono } from "hono";
import { validator } from "hono/validator";

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
  serviceUnavailableResponse,
  unauthorizedResponse,
} from "@/api/response.schema";
import {
  ensureWorkspaceResourceLimitAvailable,
  workspaceResourceFeatureIds,
  workspaceResourceLimitErrorDetails,
  workspaceResourceLimitMessage,
} from "@/lib/billing/workspace-resource-limits";
import { isErr } from "@/lib/primitives/result/results";
import {
  createContentfulConnection,
  deleteContentfulConnection,
  getContentfulConnection,
  listContentfulConnections,
  updateContentfulConnection,
  validateContentfulConnection,
} from "@/lib/contentful/connections";
import { discoverContentfulSpace } from "@/lib/contentful/discover-contentful-space";
import type { ContentfulDiscoveryError } from "@/lib/contentful/types";
import { createLogger } from "@/lib/log";

import {
  contentfulConnectionIdParamSchema,
  createContentfulConnectionBodySchema,
  discoverContentfulSpaceBodySchema,
  updateContentfulConnectionBodySchema,
} from "./contentful-connection.schema";

const logger = createLogger("contentful-connection");

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

const validateDiscoverBody = validator("json", (value, c) => {
  const parsed = discoverContentfulSpaceBodySchema.safeParse(value);
  if (!parsed.success) {
    logger.warn(
      {
        issues: parsed.error.flatten(),
      },
      "contentful discovery payload invalid",
    );
    return badRequestResponse(
      c,
      "invalid_contentful_discovery_payload",
      "Contentful discovery payload is invalid.",
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

function mapDiscoveryErrorResponse(
  c: Parameters<typeof badRequestResponse>[0],
  error: ContentfulDiscoveryError,
) {
  switch (error.code) {
    case "contentful_discovery_connection_not_found":
      return notFoundResponse(c, error.code, error.message);
    case "contentful_discovery_invalid_credentials":
      return unauthorizedResponse(c, error.code, error.message);
    case "contentful_discovery_space_unavailable":
      return notFoundResponse(c, error.code, error.message);
    default:
      return badRequestResponse(
        c,
        error.code,
        error.message,
        "contentfulStatus" in error ? { contentfulStatus: error.contentfulStatus } : undefined,
      );
  }
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
    .post("/discover", validateDiscoverBody, async (c) => {
      if (!canReadContentful(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      const result = await discoverContentfulSpace({
        organizationId: c.var.auth.organization.localOrganizationId,
        spaceId: payload.spaceId,
        environmentId: payload.environmentId,
        accessToken: payload.accessToken,
        connectionId: payload.connectionId,
      });

      if (isErr(result)) {
        return mapDiscoveryErrorResponse(c, result.error);
      }

      return c.json({ contentfulSpaceDiscovery: result.value }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      if (!canWriteContentful(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      if (payload.enabled) {
        const limitResult = await ensureWorkspaceResourceLimitAvailable({
          organizationId: c.var.auth.organization.localOrganizationId,
          featureId: workspaceResourceFeatureIds.integrations,
        });
        if (!limitResult.ok) {
          if (limitResult.error.code === "workspace_resource_limit_check_failed") {
            return serviceUnavailableResponse(
              c,
              limitResult.error.code,
              "Unable to verify integration limits. Try again later.",
            );
          }

          return conflictResponse(
            c,
            limitResult.error.code,
            workspaceResourceLimitMessage(limitResult.error.featureId),
            workspaceResourceLimitErrorDetails(limitResult.error),
          );
        }
      }

      const result = await createContentfulConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        displayName: payload.displayName,
        spaceId: payload.spaceId,
        environmentId: payload.environmentId,
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

      const { connectionId } = c.req.valid("param");
      const payload = c.req.valid("json");
      if (payload.enabled === true) {
        const existing = await getContentfulConnection({
          organizationId: c.var.auth.organization.localOrganizationId,
          connectionId,
        });
        if (!existing) {
          return notFoundResponse(c, "contentful_connection_not_found");
        }

        if (!existing.enabled) {
          const limitResult = await ensureWorkspaceResourceLimitAvailable({
            organizationId: c.var.auth.organization.localOrganizationId,
            featureId: workspaceResourceFeatureIds.integrations,
          });
          if (!limitResult.ok) {
            if (limitResult.error.code === "workspace_resource_limit_check_failed") {
              return serviceUnavailableResponse(
                c,
                limitResult.error.code,
                "Unable to verify integration limits. Try again later.",
              );
            }

            return conflictResponse(
              c,
              limitResult.error.code,
              workspaceResourceLimitMessage(limitResult.error.featureId),
              workspaceResourceLimitErrorDetails(limitResult.error),
            );
          }
        }
      }

      const result = await updateContentfulConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        connectionId,
        displayName: payload.displayName,
        spaceId: payload.spaceId,
        environmentId: payload.environmentId,
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

      if (isErr(result)) {
        return badRequestResponse(c, result.error.code, result.error.message);
      }

      return c.json(
        {
          contentfulConnectionValidation: {
            ok: true as const,
            validation: result.value,
          },
        },
        200,
      );
    });
}
