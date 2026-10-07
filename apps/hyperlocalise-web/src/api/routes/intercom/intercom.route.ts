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
  forbiddenResponse,
  serviceUnavailableResponse,
} from "@/api/response.schema";
import { listIntercomHelpCenters } from "@/lib/intercom/articles-api";
import { createIntercomClient } from "@/lib/intercom/client";
import type { IntercomRestEndpoint } from "@/lib/intercom/constants";
import { loadIntercomPipesAccessToken } from "@/lib/intercom/pipes";
import { isErr } from "@/lib/primitives/result/results";

import { intercomHelpCentersQuerySchema } from "./intercom.schema";

const validateHelpCentersQuery = validator("query", (value, c) => {
  const parsed = intercomHelpCentersQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_query_params", "Query parameters are invalid.");
  }
  return parsed.data;
});

function canReadIntegrations(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

export function createIntercomRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/help-centers", validateHelpCentersQuery, async (c) => {
      if (!canReadIntegrations(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { restEndpoint } = c.req.valid("query");
      const tokenResult = await loadIntercomPipesAccessToken({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });
      if (isErr(tokenResult)) {
        return serviceUnavailableResponse(c, tokenResult.error.code, tokenResult.error.message);
      }

      const client = createIntercomClient({
        accessToken: tokenResult.value,
        restEndpoint: restEndpoint as IntercomRestEndpoint,
      });
      const helpCenters = await listIntercomHelpCenters(client);
      return c.json({ helpCenters }, 200);
    });
}
