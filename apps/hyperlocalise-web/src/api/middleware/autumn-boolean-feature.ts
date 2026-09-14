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
import { createMiddleware } from "hono/factory";

import type { AuthVariables } from "@/api/auth/workos";
import { forbiddenResponse } from "@/api/response.schema";
import {
  isAutumnBooleanFeatureEnabled,
  type AutumnBooleanFeatureId,
} from "@/lib/billing/autumn-boolean-feature-access";

export function createAutumnBooleanFeatureMiddleware(
  featureId: AutumnBooleanFeatureId,
  message: string,
) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const enabled = await isAutumnBooleanFeatureEnabled({
      organizationId: c.var.auth.organization.localOrganizationId,
      featureId,
    });
    if (!enabled) {
      return forbiddenResponse(c, "feature_unavailable", message);
    }

    await next();
  });
}
