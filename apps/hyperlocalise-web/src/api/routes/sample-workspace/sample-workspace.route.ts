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

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { conflictResponse, forbiddenResponse } from "@/api/response.schema";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { isErr } from "@/lib/primitives/result/results";
import {
  getSampleWorkspaceStatus,
  removeSampleWorkspace,
  seedSampleWorkspace,
} from "@/lib/sample-workspace/sample-workspace-service";

const MANAGE_CAPABILITY = "workspace:update";

export function createSampleWorkspaceRoutes(
  options: { fileStorageAdapter?: FileStorageAdapter } = {},
) {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, MANAGE_CAPABILITY)) {
        return forbiddenResponse(c);
      }
      const status = await getSampleWorkspaceStatus(c.var.auth.organization.localOrganizationId);
      return c.json({ sampleWorkspace: status }, 200);
    })
    .post("/", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, MANAGE_CAPABILITY)) {
        return forbiddenResponse(c);
      }
      const seeded = await seedSampleWorkspace({
        organizationId: c.var.auth.organization.localOrganizationId,
        userId: c.var.auth.user.localUserId,
        teamId: c.var.auth.activeTeam?.id ?? null,
        fileStorageAdapter: options.fileStorageAdapter,
      });
      if (isErr(seeded)) {
        return conflictResponse(
          c,
          seeded.error.code,
          "Sample data is already loaded in this workspace.",
        );
      }
      return c.json({ sampleWorkspace: seeded.value }, 201);
    })
    .delete("/", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, MANAGE_CAPABILITY)) {
        return forbiddenResponse(c);
      }
      await removeSampleWorkspace({
        organizationId: c.var.auth.organization.localOrganizationId,
        fileStorageAdapter: options.fileStorageAdapter,
      });
      return c.body(null, 204);
    });
}
