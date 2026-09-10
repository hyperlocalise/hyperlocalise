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
  createGitLabConnection,
  deleteGitLabConnection,
  getGitLabConnection,
  listGitLabConnections,
  updateGitLabConnection,
} from "@/lib/gitlab/connections";
import type { GitLabConnectionError } from "@/lib/gitlab/types";
import { isErr } from "@/lib/primitives/result/results";

import {
  createGitLabConnectionBodySchema,
  gitlabConnectionIdParamSchema,
  updateGitLabConnectionBodySchema,
} from "./gitlab-connection.schema";

const validateConnectionParams = validator("param", (value, c) => {
  const parsed = gitlabConnectionIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_gitlab_connection_id");
  }
  return parsed.data;
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createGitLabConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_gitlab_connection_payload",
      "GitLab connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateGitLabConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_gitlab_connection_payload",
      "GitLab connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

function canReadGitLab(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteGitLab(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "provider_credentials:write");
}

function mapGitLabConnectionError(
  c: Parameters<typeof badRequestResponse>[0],
  error: GitLabConnectionError,
) {
  switch (error.code) {
    case "gitlab_connection_not_found":
      return notFoundResponse(c, error.code, error.message);
    case "gitlab_connection_in_use":
    case "gitlab_connection_duplicate":
      return conflictResponse(c, error.code, error.message);
    default:
      return badRequestResponse(c, error.code, error.message);
  }
}

export function createGitlabConnectionRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadGitLab(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const gitlabConnections = await listGitLabConnections({
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.json({ gitlabConnections }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      if (!canWriteGitLab(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const body = c.req.valid("json");
      const result = await createGitLabConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        displayName: body.displayName,
        baseUrl: body.baseUrl,
        accessToken: body.accessToken,
        enabled: body.enabled ?? true,
        validate: body.validate !== false,
      });

      if (isErr(result)) {
        return mapGitLabConnectionError(c, result.error);
      }

      return c.json({ gitlabConnection: result.value }, 201);
    })
    .get("/:connectionId", validateConnectionParams, async (c) => {
      if (!canReadGitLab(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { connectionId } = c.req.valid("param");
      const gitlabConnection = await getGitLabConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });

      if (!gitlabConnection) {
        return notFoundResponse(c, "gitlab_connection_not_found");
      }

      return c.json({ gitlabConnection }, 200);
    })
    .patch("/:connectionId", validateConnectionParams, validateUpdateBody, async (c) => {
      if (!canWriteGitLab(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { connectionId } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await updateGitLabConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        connectionId,
        displayName: body.displayName,
        baseUrl: body.baseUrl,
        accessToken: body.accessToken,
        enabled: body.enabled,
        validate:
          body.accessToken !== undefined || body.baseUrl !== undefined
            ? body.validate !== false
            : body.validate,
      });

      if (isErr(result)) {
        return mapGitLabConnectionError(c, result.error);
      }

      if (!result.value) {
        return notFoundResponse(c, "gitlab_connection_not_found");
      }

      return c.json({ gitlabConnection: result.value }, 200);
    })
    .delete("/:connectionId", validateConnectionParams, async (c) => {
      if (!canWriteGitLab(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { connectionId } = c.req.valid("param");
      const result = await deleteGitLabConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId,
      });

      if (isErr(result)) {
        return mapGitLabConnectionError(c, result.error);
      }

      if (!result.value) {
        return notFoundResponse(c, "gitlab_connection_not_found");
      }

      return c.body(null, 204);
    });
}
