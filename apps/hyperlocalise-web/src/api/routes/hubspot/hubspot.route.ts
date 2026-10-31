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
import {
  badRequestResponse,
  forbiddenResponse,
  serviceUnavailableResponse,
} from "@/api/response.schema";
import { loadHubspotAutomationClient } from "@/lib/hubspot/credentials";
import { listHubspotLibrary } from "@/lib/hubspot/list-library";
import type { HubspotSettingsError } from "@/lib/hubspot/types";
import { createLogger } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";

const logger = createLogger("hubspot-routes");

function mapHubspotError(c: Parameters<typeof badRequestResponse>[0], error: HubspotSettingsError) {
  if (error.code === "hubspot_pipes_unavailable") {
    return serviceUnavailableResponse(c, error.code, error.message);
  }
  return badRequestResponse(c, error.code, error.message);
}

export function createHubspotRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/library", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "integrations:read")) {
        return forbiddenResponse(c, "forbidden");
      }

      const loaded = await loadHubspotAutomationClient({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });
      if (isErr(loaded)) {
        return mapHubspotError(c, loaded.error);
      }

      try {
        const library = await listHubspotLibrary(loaded.value.client);
        return c.json({ library }, 200);
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          "hubspot library list failed",
        );
        return serviceUnavailableResponse(
          c,
          "hubspot_pipes_unavailable",
          "HubSpot did not accept the request. Wait a moment and try again.",
        );
      }
    });
}
