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
import { IntercomError, type IntercomClient } from "intercom-client";

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  badRequestResponse,
  forbiddenResponse,
  serviceUnavailableResponse,
  unauthorizedResponse,
  type JsonContext,
} from "@/api/response.schema";
import {
  listIntercomCollectionsForHelpCenter,
  listIntercomHelpCenters,
} from "@/lib/intercom/articles-api";
import { createIntercomClient, resolveIntercomRestEndpoint } from "@/lib/intercom/client";
import type { IntercomRestEndpoint } from "@/lib/intercom/constants";
import { loadIntercomPipesAccessToken } from "@/lib/intercom/pipes";
import type { IntercomConnectionError, IntercomPipesError } from "@/lib/intercom/types";
import { isErr, ok, type Result } from "@/lib/primitives/result/results";

import { intercomHelpCenterIdParamSchema } from "./intercom.schema";

const validateHelpCenterParams = validator("param", (value, c) => {
  const parsed = intercomHelpCenterIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_help_center_id", "Help Center id is invalid.");
  }
  return parsed.data;
});

function canReadIntegrations(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

function mapIntercomSetupError(
  c: JsonContext,
  error: IntercomConnectionError | IntercomPipesError,
) {
  if (
    error.code === "intercom_pipes_unavailable" ||
    error.code === "intercom_not_connected" ||
    error.code === "intercom_pipes_needs_reauthorization"
  ) {
    return serviceUnavailableResponse(c, error.code, error.message);
  }
  if (error.code === "intercom_region_unresolved") {
    return badRequestResponse(c, error.code, error.message);
  }
  if (error.code === "intercom_access_token_required") {
    return unauthorizedResponse(c, "intercom_unauthorized", error.message);
  }
  return badRequestResponse(c, error.code, error.message);
}

function mapIntercomProviderError(c: JsonContext, error: unknown) {
  if (error instanceof IntercomError) {
    const statusCode = error.statusCode;
    if (statusCode === 401 || statusCode === 403) {
      return unauthorizedResponse(
        c,
        "intercom_unauthorized",
        "Intercom rejected this access token for the connected workspace.",
      );
    }
  }
  return null;
}

async function loadConnectedIntercomClient(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<
  Result<
    { client: IntercomClient; restEndpoint: IntercomRestEndpoint },
    IntercomConnectionError | IntercomPipesError
  >
> {
  const tokenResult = await loadIntercomPipesAccessToken({
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(tokenResult)) {
    return tokenResult;
  }

  const regionResult = await resolveIntercomRestEndpoint({
    accessToken: tokenResult.value,
  });
  if (isErr(regionResult)) {
    return regionResult;
  }

  return ok({
    restEndpoint: regionResult.value,
    client: createIntercomClient({
      accessToken: tokenResult.value,
      restEndpoint: regionResult.value,
    }),
  });
}

export function createIntercomRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/help-centers", async (c) => {
      if (!canReadIntegrations(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const loaded = await loadConnectedIntercomClient({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });
      if (isErr(loaded)) {
        return mapIntercomSetupError(c, loaded.error);
      }

      try {
        const helpCenters = await listIntercomHelpCenters(loaded.value.client);
        return c.json({ restEndpoint: loaded.value.restEndpoint, helpCenters }, 200);
      } catch (error) {
        const mapped = mapIntercomProviderError(c, error);
        if (mapped) {
          return mapped;
        }
        throw error;
      }
    })
    .get("/help-centers/:helpCenterId/collections", validateHelpCenterParams, async (c) => {
      if (!canReadIntegrations(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { helpCenterId } = c.req.valid("param");
      const loaded = await loadConnectedIntercomClient({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });
      if (isErr(loaded)) {
        return mapIntercomSetupError(c, loaded.error);
      }

      try {
        const collections = await listIntercomCollectionsForHelpCenter({
          client: loaded.value.client,
          helpCenterId,
        });
        return c.json({ collections }, 200);
      } catch (error) {
        const mapped = mapIntercomProviderError(c, error);
        if (mapped) {
          return mapped;
        }
        throw error;
      }
    });
}
