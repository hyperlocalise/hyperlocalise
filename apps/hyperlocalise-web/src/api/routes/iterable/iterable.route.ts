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
import { pingIterableCredentials } from "@/lib/iterable/ping";
import {
  getIterablePipesConnectionStatus,
  loadIterablePipesApiKey,
  saveIterablePipesApiKey,
} from "@/lib/iterable/pipes";
import {
  deleteIterableConnectionSettings,
  getIterableConnectionSettings,
  upsertIterableConnectionSettings,
} from "@/lib/iterable/settings";
import { listIterableLibraryForPicker } from "@/lib/iterable/list-library";
import type { IterablePipesError, IterableSettingsError } from "@/lib/iterable/types";
import { isErr } from "@/lib/primitives/result/results";

import { iterableLibraryQuerySchema, upsertIterableConnectionBodySchema } from "./iterable.schema";

function canReadIterable(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteIterable(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:write");
}

function mapIterableError(
  c: Parameters<typeof badRequestResponse>[0],
  error: IterablePipesError | IterableSettingsError,
) {
  if (
    error.code === "iterable_pipes_unavailable" ||
    error.code === "iterable_temporarily_unavailable" ||
    error.code === "iterable_pipes_provider_missing"
  ) {
    return serviceUnavailableResponse(c, error.code, error.message);
  }
  if (error.code === "iterable_api_key_required") {
    return badRequestResponse(c, error.code, error.message);
  }
  if (
    error.code === "iterable_region_missing" ||
    error.code === "iterable_region_invalid" ||
    error.code === "iterable_credentials_invalid" ||
    error.code === "iterable_region_unreachable" ||
    error.code === "iterable_permission_missing"
  ) {
    return badRequestResponse(c, error.code, error.message);
  }
  return notFoundResponse(c, error.code, error.message);
}

const validateUpsertBody = validator("json", (value, c) => {
  const parsed = upsertIterableConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_iterable_region",
      "Choose an Iterable data center (US or EU).",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateLibraryQuery = validator("query", (value, c) => {
  const parsed = iterableLibraryQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_query_params", "Query parameters are invalid.");
  }
  return parsed.data;
});

export function createIterableRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadIterable(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const localOrganizationId = c.var.auth.organization.localOrganizationId;
      const workosUserId = c.var.auth.user.workosUserId;
      const statusResult = await getIterablePipesConnectionStatus({
        localOrganizationId,
        workosUserId,
      });
      if (isErr(statusResult)) {
        return mapIterableError(c, statusResult.error);
      }

      if (!statusResult.value.connected) {
        await deleteIterableConnectionSettings({ localOrganizationId, workosUserId });
        return c.json({ iterable: null }, 200);
      }

      const settings = await getIterableConnectionSettings({
        localOrganizationId,
        workosUserId,
      });
      return c.json({ iterable: settings }, 200);
    })
    .get("/library", validateLibraryQuery, async (c) => {
      if (!canReadIterable(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const localOrganizationId = c.var.auth.organization.localOrganizationId;
      const workosUserId = c.var.auth.user.workosUserId;
      const library = await listIterableLibraryForPicker({
        localOrganizationId,
        workosUserId,
      });
      if (isErr(library)) {
        return mapIterableError(c, library.error);
      }
      return c.json({ templates: library.value.templates, snippets: library.value.snippets }, 200);
    })
    .put("/", validateUpsertBody, async (c) => {
      if (!canWriteIterable(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const localOrganizationId = c.var.auth.organization.localOrganizationId;
      const workosUserId = c.var.auth.user.workosUserId;
      const { region, apiKey } = c.req.valid("json");
      const trimmedApiKey = apiKey?.trim() ?? "";
      const statusResult = await getIterablePipesConnectionStatus({
        localOrganizationId,
        workosUserId,
      });
      if (isErr(statusResult)) {
        return mapIterableError(c, statusResult.error);
      }
      if (!statusResult.value.connected && !trimmedApiKey) {
        return badRequestResponse(
          c,
          "iterable_api_key_required",
          "Paste an Iterable server-side API key to connect.",
        );
      }

      let apiKeyToPing = trimmedApiKey;
      if (!apiKeyToPing) {
        const storedKey = await loadIterablePipesApiKey({
          localOrganizationId,
          workosUserId,
        });
        if (isErr(storedKey)) {
          return mapIterableError(c, storedKey.error);
        }
        apiKeyToPing = storedKey.value;
      }

      const ping = await pingIterableCredentials({
        apiKey: apiKeyToPing,
        region,
      });
      if (isErr(ping)) {
        return mapIterableError(c, ping.error);
      }

      if (trimmedApiKey) {
        const keyResult = await saveIterablePipesApiKey({
          localOrganizationId,
          workosUserId,
          apiKey: trimmedApiKey,
        });
        if (isErr(keyResult)) {
          return mapIterableError(c, keyResult.error);
        }
      }

      const result = await upsertIterableConnectionSettings({
        localOrganizationId,
        workosUserId,
        region,
      });
      if (isErr(result)) {
        return badRequestResponse(c, result.error.code, result.error.message);
      }

      return c.json({ iterable: result.value }, 200);
    })
    .delete("/", async (c) => {
      if (!canWriteIterable(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      await deleteIterableConnectionSettings({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });
      return c.body(null, 204);
    });
}
