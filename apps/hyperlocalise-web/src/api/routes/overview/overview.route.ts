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

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { internalErrorResponse } from "@/api/response.schema";
import { getWorkspaceOverviewSnapshot } from "@/lib/workspace/overview-snapshot";

export function createOverviewRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      try {
        const overview = await getWorkspaceOverviewSnapshot(c.var.auth);
        return c.json({ overview }, 200);
      } catch {
        return internalErrorResponse(c, "overview_failed", "Failed to load workspace overview.");
      }
    });
}
