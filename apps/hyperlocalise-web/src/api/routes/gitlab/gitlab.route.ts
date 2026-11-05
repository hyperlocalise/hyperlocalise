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

import { isIntegrationsReadAllowed } from "@/api/auth/capability-guards";
import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  serviceUnavailableResponse,
} from "@/api/response.schema";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import {
  checkSavedGitLabConnection,
  deleteGitLabConnection,
  findGitLabConnection,
  getGitLabConnection,
  listGitLabConnections,
  saveGitLabConnection,
  setDefaultGitLabConnection,
} from "@/lib/gitlab/connections";
import { listAccessibleGitLabProjects } from "@/lib/gitlab/repository-context";
import { isErr } from "@/lib/primitives/result/results";

import { gitlabConnectionParamsSchema, saveGitLabConnectionBodySchema } from "./gitlab.schema";

const validateSaveConnectionBody = validator("json", (value, c) => {
  const parsed = saveGitLabConnectionBodySchema.safeParse(value);
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

const validateConnectionParams = validator("param", (value, c) => {
  const parsed = gitlabConnectionParamsSchema.safeParse(value);
  if (!parsed.success) {
    return notFoundResponse(c, "gitlab_connection_not_found");
  }
  return parsed.data;
});

function canWriteGitLabConnection(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "provider_credentials:write");
}

export function createGitlabRoutes() {
  return (
    new Hono<{ Variables: AuthVariables }>()
      .use("*", workosAuthMiddleware)
      .get("/projects", async (c) => {
        if (!isIntegrationsReadAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const result = await listAccessibleGitLabProjects({
          localOrganizationId: c.var.auth.organization.localOrganizationId,
          workosUserId: c.var.auth.user.workosUserId,
        });

        if (result.error?.code === "gitlab_pipes_unavailable") {
          return serviceUnavailableResponse(c, result.error.code, result.error.message);
        }

        if (
          result.error &&
          result.error.code !== "gitlab_not_connected" &&
          result.error.code !== "gitlab_pipes_needs_reauthorization"
        ) {
          return serviceUnavailableResponse(c, result.error.code, result.error.message);
        }

        return c.json({ projects: result.projects }, 200);
      })
      // The default connection: what chat and automations use, and what "connected" means.
      .get("/connection", async (c) => {
        if (!isIntegrationsReadAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const gitlabConnection = await getGitLabConnection({
          organizationId: c.var.auth.organization.localOrganizationId,
        });

        return c.json({ gitlabConnection }, 200);
      })
      .get("/connections", async (c) => {
        if (!isIntegrationsReadAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const gitlabConnections = await listGitLabConnections({
          organizationId: c.var.auth.organization.localOrganizationId,
        });

        return c.json({ gitlabConnections }, 200);
      })
      .post("/connections", validateSaveConnectionBody, async (c) => {
        if (!canWriteGitLabConnection(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const body = c.req.valid("json");
        const organizationId = c.var.auth.organization.localOrganizationId;
        // The workspace counts as newly connected once, not with each connection it adds.
        const firstConnection = (await listGitLabConnections({ organizationId })).length === 0;
        const result = await saveGitLabConnection({
          organizationId,
          userId: c.var.auth.user.localUserId,
          name: body.name,
          serverUrl: body.serverUrl,
          accessToken: body.accessToken,
          signal: c.req.raw.signal,
        });
        if (isErr(result)) {
          return badRequestResponse(c, result.error.code, result.error.message);
        }

        if (firstConnection) {
          serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.integrationConnected, {
            status: "created",
            source: "gitlab",
          });
        }

        return c.json({ gitlabConnection: result.value.connection }, 201);
      })
      .get("/connections/:connectionId/check", validateConnectionParams, async (c) => {
        if (!isIntegrationsReadAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const result = await checkSavedGitLabConnection({
          organizationId: c.var.auth.organization.localOrganizationId,
          connectionId: c.req.valid("param").connectionId,
          signal: c.req.raw.signal,
        });
        if (!isErr(result) && result.value === "not_connected") {
          return notFoundResponse(c, "gitlab_connection_not_found");
        }

        return c.json(
          isErr(result)
            ? { working: false as const, code: result.error.code, message: result.error.message }
            : { working: true as const },
          200,
        );
      })
      .put(
        "/connections/:connectionId",
        validateConnectionParams,
        validateSaveConnectionBody,
        async (c) => {
          if (!canWriteGitLabConnection(c.var.auth.membership.role)) {
            return forbiddenResponse(c);
          }

          const body = c.req.valid("json");
          const result = await saveGitLabConnection({
            organizationId: c.var.auth.organization.localOrganizationId,
            userId: c.var.auth.user.localUserId,
            connectionId: c.req.valid("param").connectionId,
            name: body.name,
            serverUrl: body.serverUrl,
            accessToken: body.accessToken,
            signal: c.req.raw.signal,
          });
          if (isErr(result)) {
            return result.error.code === "gitlab_connection_not_found"
              ? notFoundResponse(c, result.error.code)
              : badRequestResponse(c, result.error.code, result.error.message);
          }

          return c.json({ gitlabConnection: result.value.connection }, 200);
        },
      )
      .post("/connections/:connectionId/default", validateConnectionParams, async (c) => {
        if (!canWriteGitLabConnection(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const organizationId = c.var.auth.organization.localOrganizationId;
        const connectionId = c.req.valid("param").connectionId;
        const marked = await setDefaultGitLabConnection({ organizationId, connectionId });
        if (!marked) {
          return notFoundResponse(c, "gitlab_connection_not_found");
        }
        const gitlabConnection = await findGitLabConnection({ organizationId, connectionId });
        if (!gitlabConnection) {
          return notFoundResponse(c, "gitlab_connection_not_found");
        }

        return c.json({ gitlabConnection }, 200);
      })
      .delete("/connections/:connectionId", validateConnectionParams, async (c) => {
        if (!canWriteGitLabConnection(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const deleted = await deleteGitLabConnection({
          organizationId: c.var.auth.organization.localOrganizationId,
          connectionId: c.req.valid("param").connectionId,
        });
        if (!deleted) {
          return notFoundResponse(c, "gitlab_connection_not_found");
        }

        return c.body(null, 204);
      })
  );
}
