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
import { listCustomerIoBroadcasts } from "@/lib/customer-io/client";
import { isCustomerIoRegion } from "@/lib/customer-io/constants";
import { pingCustomerIoCredentials } from "@/lib/customer-io/ping";
import {
  getCustomerIoPipesConnectionStatus,
  loadCustomerIoPipesApiKey,
  saveCustomerIoPipesApiKey,
} from "@/lib/customer-io/pipes";
import {
  deleteCustomerIoConnectionSettings,
  getCustomerIoConnectionSettings,
  upsertCustomerIoConnectionSettings,
} from "@/lib/customer-io/settings";
import type { CustomerIoPipesError, CustomerIoSettingsError } from "@/lib/customer-io/types";
import { isErr } from "@/lib/primitives/result/results";

import {
  customerIoLibraryQuerySchema,
  upsertCustomerIoConnectionBodySchema,
} from "./customer-io.schema";

function canReadCustomerIo(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function canWriteCustomerIo(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:write");
}

function mapCustomerIoError(
  c: Parameters<typeof badRequestResponse>[0],
  error: CustomerIoPipesError | CustomerIoSettingsError,
) {
  if (
    error.code === "customer_io_pipes_unavailable" ||
    error.code === "customer_io_temporarily_unavailable"
  ) {
    return serviceUnavailableResponse(c, error.code, error.message);
  }
  if (error.code === "customer_io_api_key_required") {
    return badRequestResponse(c, error.code, error.message);
  }
  if (
    error.code === "customer_io_region_missing" ||
    error.code === "customer_io_region_invalid" ||
    error.code === "customer_io_credentials_invalid" ||
    error.code === "customer_io_region_unreachable" ||
    error.code === "customer_io_permission_missing"
  ) {
    return badRequestResponse(c, error.code, error.message);
  }
  return notFoundResponse(c, error.code, error.message);
}

const validateUpsertBody = validator("json", (value, c) => {
  const parsed = upsertCustomerIoConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_customer_io_region",
      "Choose a Customer.io region (US or EU).",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateLibraryQuery = validator("query", (value, c) => {
  const parsed = customerIoLibraryQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_query_params", "Query parameters are invalid.");
  }
  return parsed.data;
});

export function createCustomerIoRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadCustomerIo(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const localOrganizationId = c.var.auth.organization.localOrganizationId;
      const workosUserId = c.var.auth.user.workosUserId;
      const statusResult = await getCustomerIoPipesConnectionStatus({
        localOrganizationId,
        workosUserId,
      });
      if (isErr(statusResult)) {
        return mapCustomerIoError(c, statusResult.error);
      }

      if (!statusResult.value.connected) {
        await deleteCustomerIoConnectionSettings({ localOrganizationId, workosUserId });
        return c.json({ customerIo: null }, 200);
      }

      const settings = await getCustomerIoConnectionSettings({
        localOrganizationId,
        workosUserId,
      });
      return c.json({ customerIo: settings }, 200);
    })
    .get("/broadcasts", validateLibraryQuery, async (c) => {
      if (!canReadCustomerIo(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const localOrganizationId = c.var.auth.organization.localOrganizationId;
      const workosUserId = c.var.auth.user.workosUserId;
      const settings = await getCustomerIoConnectionSettings({
        localOrganizationId,
        workosUserId,
      });
      if (!settings || !isCustomerIoRegion(settings.region)) {
        return badRequestResponse(
          c,
          "customer_io_region_missing",
          "Save a Customer.io region in Integrations before using it.",
        );
      }
      const keyResult = await loadCustomerIoPipesApiKey({ localOrganizationId, workosUserId });
      if (isErr(keyResult)) {
        return mapCustomerIoError(c, keyResult.error);
      }

      try {
        const broadcasts = await listCustomerIoBroadcasts({
          apiKey: keyResult.value,
          region: settings.region,
        });
        return c.json({ broadcasts }, 200);
      } catch {
        return serviceUnavailableResponse(
          c,
          "customer_io_temporarily_unavailable",
          "Customer.io did not accept the request. Wait a moment and try again.",
        );
      }
    })
    .put("/", validateUpsertBody, async (c) => {
      if (!canWriteCustomerIo(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const localOrganizationId = c.var.auth.organization.localOrganizationId;
      const workosUserId = c.var.auth.user.workosUserId;
      const { region, apiKey } = c.req.valid("json");
      const trimmedApiKey = apiKey?.trim() ?? "";
      const statusResult = await getCustomerIoPipesConnectionStatus({
        localOrganizationId,
        workosUserId,
      });
      if (isErr(statusResult)) {
        return mapCustomerIoError(c, statusResult.error);
      }
      if (!statusResult.value.connected && !trimmedApiKey) {
        return badRequestResponse(
          c,
          "customer_io_api_key_required",
          "Paste a Customer.io App API key to connect.",
        );
      }

      let apiKeyToPing = trimmedApiKey;
      if (!apiKeyToPing) {
        const storedKey = await loadCustomerIoPipesApiKey({
          localOrganizationId,
          workosUserId,
        });
        if (isErr(storedKey)) {
          return mapCustomerIoError(c, storedKey.error);
        }
        apiKeyToPing = storedKey.value;
      }

      const ping = await pingCustomerIoCredentials({
        apiKey: apiKeyToPing,
        region,
      });
      if (isErr(ping)) {
        return mapCustomerIoError(c, ping.error);
      }

      if (trimmedApiKey) {
        const keyResult = await saveCustomerIoPipesApiKey({
          localOrganizationId,
          workosUserId,
          apiKey: trimmedApiKey,
        });
        if (isErr(keyResult)) {
          return mapCustomerIoError(c, keyResult.error);
        }
      }

      const result = await upsertCustomerIoConnectionSettings({
        localOrganizationId,
        workosUserId,
        region,
      });
      if (isErr(result)) {
        return badRequestResponse(c, result.error.code, result.error.message);
      }

      return c.json({ customerIo: result.value }, 200);
    })
    .delete("/", async (c) => {
      if (!canWriteCustomerIo(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      await deleteCustomerIoConnectionSettings({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });
      return c.body(null, 204);
    });
}
