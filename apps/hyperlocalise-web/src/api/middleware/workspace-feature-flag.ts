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
import type { Flag } from "flags/next";
import { createMiddleware } from "hono/factory";

import type { AuthVariables } from "@/api/auth/workos";
import { forbiddenResponse } from "@/api/response.schema";
import type { WorkosFlagEntities } from "@/lib/flags/workos-flag-entities";

async function isWorkspaceFeatureFlagEnabled(
  workspaceFlag: Flag<boolean, WorkosFlagEntities>,
  auth: AuthVariables["auth"],
) {
  try {
    return (
      (await workspaceFlag.run({
        identify: () => ({
          organization: { id: auth.organization.workosOrganizationId },
          user: { id: auth.user.workosUserId },
        }),
      })) === true
    );
  } catch {
    return false;
  }
}

export function createWorkspaceFeatureFlagMiddleware(
  workspaceFlag: Flag<boolean, WorkosFlagEntities>,
  message: string,
) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const enabled = await isWorkspaceFeatureFlagEnabled(workspaceFlag, c.var.auth);
    if (!enabled) {
      return forbiddenResponse(c, "feature_unavailable", message);
    }

    await next();
  });
}
