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
import {
  getLoopsPipesConnectionStatus,
  loadLoopsPipesApiKey,
  saveLoopsPipesApiKey,
} from "@/lib/loops/pipes";
import { pingLoopsCredentials } from "@/lib/loops/ping";
import type { LoopsPipesError, LoopsSettingsError } from "@/lib/loops/types";
import { isErr } from "@/lib/primitives/result/results";

import { upsertLoopsConnectionBodySchema } from "./loops.schema";

function canReadLoops(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteLoops(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:write");
}

function mapLoopsError(
  c: Parameters<typeof badRequestResponse>[0],
  error: LoopsPipesError | LoopsSettingsError,
) {
  if (error.code === "loops_pipes_unavailable" || error.code === "loops_temporarily_unavailable") {
    return serviceUnavailableResponse(c, error.code, error.message);
  }
  if (error.code === "loops_api_key_required" || error.code === "loops_credentials_invalid") {
    return badRequestResponse(c, error.code, error.message);
  }
  return notFoundResponse(c, error.code, error.message);
}

const validateUpsertBody = validator("json", (value, c) => {
  const parsed = upsertLoopsConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_loops_connection",
      "Paste a Loops API key to connect.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

export function createLoopsRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadLoops(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const localOrganizationId = c.var.auth.organization.localOrganizationId;
      const workosUserId = c.var.auth.user.workosUserId;
      const statusResult = await getLoopsPipesConnectionStatus({
        localOrganizationId,
        workosUserId,
      });
      if (isErr(statusResult)) {
        return mapLoopsError(c, statusResult.error);
      }

      if (!statusResult.value.connected) {
        return c.json({ loops: null }, 200);
      }

      return c.json(
        { loops: { connected: true, apiKeyLast4: statusResult.value.apiKeyLast4 } },
        200,
      );
    })
    .put("/", validateUpsertBody, async (c) => {
      if (!canWriteLoops(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const localOrganizationId = c.var.auth.organization.localOrganizationId;
      const workosUserId = c.var.auth.user.workosUserId;
      const { apiKey } = c.req.valid("json");
      const trimmedApiKey = apiKey?.trim() ?? "";
      const statusResult = await getLoopsPipesConnectionStatus({
        localOrganizationId,
        workosUserId,
      });
      if (isErr(statusResult)) {
        return mapLoopsError(c, statusResult.error);
      }
      if (!statusResult.value.connected && !trimmedApiKey) {
        return badRequestResponse(c, "loops_api_key_required", "Paste a Loops API key to connect.");
      }

      let apiKeyToPing = trimmedApiKey;
      if (!apiKeyToPing) {
        const storedKey = await loadLoopsPipesApiKey({
          localOrganizationId,
          workosUserId,
        });
        if (isErr(storedKey)) {
          return mapLoopsError(c, storedKey.error);
        }
        apiKeyToPing = storedKey.value;
      }

      const ping = await pingLoopsCredentials({ apiKey: apiKeyToPing });
      if (isErr(ping)) {
        return mapLoopsError(c, ping.error);
      }

      if (trimmedApiKey) {
        const keyResult = await saveLoopsPipesApiKey({
          localOrganizationId,
          workosUserId,
          apiKey: trimmedApiKey,
        });
        if (isErr(keyResult)) {
          return mapLoopsError(c, keyResult.error);
        }
      }

      return c.json({ loops: { connected: true } }, 200);
    })
    .delete("/", async (c) => {
      if (!canWriteLoops(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }
      return c.body(null, 204);
    });
}
