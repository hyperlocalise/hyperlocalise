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
import { listBrazeCampaignsForPicker } from "@/lib/braze/list-campaigns";
import { listBrazeLibraryForPicker } from "@/lib/braze/list-library";
import { pingBrazeRestCredentials } from "@/lib/braze/ping";
import {
  getBrazePipesConnectionStatus,
  loadBrazePipesApiKey,
  saveBrazePipesApiKey,
} from "@/lib/braze/pipes";
import {
  deleteBrazeConnectionSettings,
  getBrazeConnectionSettings,
  upsertBrazeConnectionSettings,
} from "@/lib/braze/settings";
import type { BrazePipesError, BrazeSettingsError } from "@/lib/braze/types";
import { isErr } from "@/lib/primitives/result/results";

import { brazeLibraryQuerySchema, upsertBrazeConnectionBodySchema } from "./braze.schema";

function canReadBraze(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteBraze(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:write");
}

function mapBrazePipesError(
  c: Parameters<typeof badRequestResponse>[0],
  error: BrazePipesError | BrazeSettingsError,
) {
  if (error.code === "braze_pipes_unavailable" || error.code === "braze_temporarily_unavailable") {
    return serviceUnavailableResponse(c, error.code, error.message);
  }
  if (error.code === "braze_api_key_required") {
    return badRequestResponse(c, error.code, error.message);
  }
  if (
    error.code === "braze_endpoint_missing" ||
    error.code === "braze_endpoint_invalid" ||
    error.code === "braze_credentials_invalid" ||
    error.code === "braze_cluster_unreachable" ||
    error.code === "braze_permission_missing"
  ) {
    return badRequestResponse(c, error.code, error.message);
  }
  return notFoundResponse(c, error.code, error.message);
}

const validateUpsertBody = validator("json", (value, c) => {
  const parsed = upsertBrazeConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_braze_endpoint",
      "Choose a Braze REST cluster from the allowlisted instances.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateLibraryQuery = validator("query", (value, c) => {
  const parsed = brazeLibraryQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_query_params", "Query parameters are invalid.");
  }
  return parsed.data;
});

export function createBrazeRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadBraze(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const localOrganizationId = c.var.auth.organization.localOrganizationId;
      const workosUserId = c.var.auth.user.workosUserId;
      const statusResult = await getBrazePipesConnectionStatus({
        localOrganizationId,
        workosUserId,
      });
      if (isErr(statusResult)) {
        return mapBrazePipesError(c, statusResult.error);
      }

      if (!statusResult.value.connected) {
        await deleteBrazeConnectionSettings({ localOrganizationId, workosUserId });
        return c.json({ braze: null }, 200);
      }

      const settings = await getBrazeConnectionSettings({
        localOrganizationId,
        workosUserId,
      });
      return c.json({ braze: settings }, 200);
    })
    .get("/library", validateLibraryQuery, async (c) => {
      if (!canReadBraze(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const library = await listBrazeLibraryForPicker({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
        projectId: c.req.valid("query").projectId,
      });
      if (isErr(library)) {
        return mapBrazePipesError(c, library.error);
      }

      return c.json(library.value, 200);
    })
    .get("/campaigns", async (c) => {
      if (!canReadBraze(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const library = await listBrazeCampaignsForPicker({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });
      if (isErr(library)) {
        return mapBrazePipesError(c, library.error);
      }

      return c.json(library.value, 200);
    })
    .put("/", validateUpsertBody, async (c) => {
      if (!canWriteBraze(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const localOrganizationId = c.var.auth.organization.localOrganizationId;
      const workosUserId = c.var.auth.user.workosUserId;
      const { restEndpoint, apiKey } = c.req.valid("json");
      const trimmedApiKey = apiKey?.trim() ?? "";
      const statusResult = await getBrazePipesConnectionStatus({
        localOrganizationId,
        workosUserId,
      });
      if (isErr(statusResult)) {
        return mapBrazePipesError(c, statusResult.error);
      }
      if (!statusResult.value.connected && !trimmedApiKey) {
        return badRequestResponse(
          c,
          "braze_api_key_required",
          "Paste a Braze REST API key to connect.",
        );
      }

      let apiKeyToPing = trimmedApiKey;
      if (!apiKeyToPing) {
        const storedKey = await loadBrazePipesApiKey({
          localOrganizationId,
          workosUserId,
        });
        if (isErr(storedKey)) {
          return mapBrazePipesError(c, storedKey.error);
        }
        apiKeyToPing = storedKey.value;
      }

      const ping = await pingBrazeRestCredentials({
        apiKey: apiKeyToPing,
        restEndpoint,
      });
      if (isErr(ping)) {
        return mapBrazePipesError(c, ping.error);
      }

      if (trimmedApiKey) {
        const keyResult = await saveBrazePipesApiKey({
          localOrganizationId,
          workosUserId,
          apiKey: trimmedApiKey,
        });
        if (isErr(keyResult)) {
          return mapBrazePipesError(c, keyResult.error);
        }
      }

      const result = await upsertBrazeConnectionSettings({
        localOrganizationId,
        workosUserId,
        restEndpoint,
      });
      if (isErr(result)) {
        return badRequestResponse(c, result.error.code, result.error.message);
      }

      return c.json({ braze: result.value }, 200);
    })
    .delete("/", async (c) => {
      if (!canWriteBraze(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      await deleteBrazeConnectionSettings({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });
      return c.body(null, 204);
    });
}
