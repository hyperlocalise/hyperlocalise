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
  notFoundResponse,
  serviceUnavailableResponse,
} from "@/api/response.schema";
import { pingHubspotCredentials } from "@/lib/hubspot/ping";
import {
  getHubspotPipesConnectionStatus,
  loadHubspotPipesApiKey,
  saveHubspotPipesApiKey,
} from "@/lib/hubspot/pipes";
import type { HubspotPipesError, HubspotSettingsError } from "@/lib/hubspot/types";
import { isErr } from "@/lib/primitives/result/results";

import { upsertHubspotConnectionBodySchema } from "./hubspot.schema";

function canReadHubspot(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteHubspot(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:write");
}

function mapHubspotError(
  c: Parameters<typeof badRequestResponse>[0],
  error: HubspotPipesError | HubspotSettingsError,
) {
  if (
    error.code === "hubspot_pipes_unavailable" ||
    error.code === "hubspot_temporarily_unavailable" ||
    error.code === "hubspot_pipes_provider_missing"
  ) {
    return serviceUnavailableResponse(c, error.code, error.message);
  }
  if (error.code === "hubspot_api_key_required" || error.code === "hubspot_credentials_invalid") {
    return badRequestResponse(c, error.code, error.message);
  }
  return notFoundResponse(c, error.code, error.message);
}

const validateUpsertBody = validator("json", (value, c) => {
  const parsed = upsertHubspotConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_hubspot_connection",
      "Paste a HubSpot private-app access token to connect.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

export function createHubspotRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadHubspot(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const localOrganizationId = c.var.auth.organization.localOrganizationId;
      const workosUserId = c.var.auth.user.workosUserId;
      const statusResult = await getHubspotPipesConnectionStatus({
        localOrganizationId,
        workosUserId,
      });
      if (isErr(statusResult)) {
        return mapHubspotError(c, statusResult.error);
      }

      if (!statusResult.value.connected) {
        return c.json({ hubspot: null }, 200);
      }

      return c.json(
        { hubspot: { connected: true, apiKeyLast4: statusResult.value.apiKeyLast4 } },
        200,
      );
    })
    .put("/", validateUpsertBody, async (c) => {
      if (!canWriteHubspot(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const localOrganizationId = c.var.auth.organization.localOrganizationId;
      const workosUserId = c.var.auth.user.workosUserId;
      const { apiKey } = c.req.valid("json");
      const trimmedApiKey = apiKey?.trim() ?? "";
      const statusResult = await getHubspotPipesConnectionStatus({
        localOrganizationId,
        workosUserId,
      });
      if (isErr(statusResult)) {
        return mapHubspotError(c, statusResult.error);
      }
      if (!statusResult.value.connected && !trimmedApiKey) {
        return badRequestResponse(
          c,
          "hubspot_api_key_required",
          "Paste a HubSpot private-app access token to connect.",
        );
      }

      let apiKeyToPing = trimmedApiKey;
      if (!apiKeyToPing) {
        const storedKey = await loadHubspotPipesApiKey({
          localOrganizationId,
          workosUserId,
        });
        if (isErr(storedKey)) {
          return mapHubspotError(c, storedKey.error);
        }
        apiKeyToPing = storedKey.value;
      }

      const ping = await pingHubspotCredentials({ accessToken: apiKeyToPing });
      if (isErr(ping)) {
        return mapHubspotError(c, ping.error);
      }

      if (trimmedApiKey) {
        const keyResult = await saveHubspotPipesApiKey({
          localOrganizationId,
          workosUserId,
          apiKey: trimmedApiKey,
        });
        if (isErr(keyResult)) {
          return mapHubspotError(c, keyResult.error);
        }
      }

      return c.json({ hubspot: { connected: true } }, 200);
    })
    .delete("/", async (c) => {
      if (!canWriteHubspot(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }
      return c.body(null, 204);
    });
}
