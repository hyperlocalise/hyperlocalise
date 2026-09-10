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

import { isIntegrationsReadAllowed } from "@/api/auth/capability-guards";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { forbiddenResponse, serviceUnavailableResponse } from "@/api/response.schema";
import { listAccessibleGitLabProjects } from "@/lib/gitlab/repository-context";

export function createGitlabRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/projects", async (c) => {
      if (!isIntegrationsReadAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const result = await listAccessibleGitLabProjects({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });

      if (result.error?.code === "gitlab_pipes_unavailable" && result.projects.length === 0) {
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
    });
}
