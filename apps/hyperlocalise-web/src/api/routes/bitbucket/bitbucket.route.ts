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

import { isIntegrationsReadAllowed } from "@/api/auth/capability-guards";
import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { badRequestResponse, forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import {
  checkSavedBitbucketConnection,
  deleteBitbucketConnection,
  findBitbucketConnection,
  listBitbucketConnections,
  saveBitbucketConnection,
  setDefaultBitbucketConnection,
} from "@/lib/bitbucket/connections";
import { isErr } from "@/lib/primitives/result/results";

import {
  bitbucketConnectionParamsSchema,
  saveBitbucketConnectionBodySchema,
} from "./bitbucket.schema";

const validateSaveConnectionBody = validator("json", (value, c) => {
  const parsed = saveBitbucketConnectionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_bitbucket_connection_payload",
      "Bitbucket connection payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateConnectionParams = validator("param", (value, c) => {
  const parsed = bitbucketConnectionParamsSchema.safeParse(value);
  if (!parsed.success) {
    return notFoundResponse(c, "bitbucket_connection_not_found");
  }
  return parsed.data;
});

function canWriteBitbucketConnection(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "provider_credentials:write");
}

/**
 * A workspace's Bitbucket Cloud connections: an API token (with its Atlassian account email) or
 * an access token, encrypted and never returned. Project syncs name the connection they use.
 */
export function createBitbucketRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/connections", async (c) => {
      if (!isIntegrationsReadAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }
      const bitbucketConnections = await listBitbucketConnections({
        organizationId: c.var.auth.organization.localOrganizationId,
      });
      return c.json({ bitbucketConnections }, 200);
    })
    .post("/connections", validateSaveConnectionBody, async (c) => {
      if (!canWriteBitbucketConnection(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }
      const body = c.req.valid("json");
      const organizationId = c.var.auth.organization.localOrganizationId;
      // The workspace counts as newly connected once, not with each connection it adds.
      const firstConnection = (await listBitbucketConnections({ organizationId })).length === 0;
      const result = await saveBitbucketConnection({
        organizationId,
        userId: c.var.auth.user.localUserId,
        name: body.name,
        accountEmail: body.accountEmail,
        accessToken: body.accessToken,
        signal: c.req.raw.signal,
      });
      if (isErr(result)) {
        return badRequestResponse(c, result.error.code, result.error.message);
      }
      if (firstConnection) {
        serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.integrationConnected, {
          status: "created",
          source: "bitbucket",
        });
      }
      return c.json(
        { bitbucketConnection: result.value.connection, check: result.value.check },
        201,
      );
    })
    .get("/connections/:connectionId/check", validateConnectionParams, async (c) => {
      if (!isIntegrationsReadAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }
      const result = await checkSavedBitbucketConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId: c.req.valid("param").connectionId,
        signal: c.req.raw.signal,
      });
      if (isErr(result)) {
        return c.json(
          { working: false as const, code: result.error.code, message: result.error.message },
          200,
        );
      }
      if (result.value === "not_connected") {
        return notFoundResponse(c, "bitbucket_connection_not_found");
      }
      return c.json(
        { working: true as const, readsRepositories: result.value.readsRepositories },
        200,
      );
    })
    .put(
      "/connections/:connectionId",
      validateConnectionParams,
      validateSaveConnectionBody,
      async (c) => {
        if (!canWriteBitbucketConnection(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }
        const body = c.req.valid("json");
        const result = await saveBitbucketConnection({
          organizationId: c.var.auth.organization.localOrganizationId,
          userId: c.var.auth.user.localUserId,
          connectionId: c.req.valid("param").connectionId,
          name: body.name,
          accountEmail: body.accountEmail,
          accessToken: body.accessToken,
          signal: c.req.raw.signal,
        });
        if (isErr(result)) {
          return result.error.code === "bitbucket_connection_not_found"
            ? notFoundResponse(c, result.error.code)
            : badRequestResponse(c, result.error.code, result.error.message);
        }
        return c.json(
          { bitbucketConnection: result.value.connection, check: result.value.check },
          200,
        );
      },
    )
    .post("/connections/:connectionId/default", validateConnectionParams, async (c) => {
      if (!canWriteBitbucketConnection(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }
      const organizationId = c.var.auth.organization.localOrganizationId;
      const connectionId = c.req.valid("param").connectionId;
      const marked = await setDefaultBitbucketConnection({ organizationId, connectionId });
      const bitbucketConnection = marked
        ? await findBitbucketConnection({ organizationId, connectionId })
        : null;
      if (!bitbucketConnection) {
        return notFoundResponse(c, "bitbucket_connection_not_found");
      }
      return c.json({ bitbucketConnection }, 200);
    })
    .delete("/connections/:connectionId", validateConnectionParams, async (c) => {
      if (!canWriteBitbucketConnection(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }
      const deleted = await deleteBitbucketConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
        connectionId: c.req.valid("param").connectionId,
      });
      if (!deleted) {
        return notFoundResponse(c, "bitbucket_connection_not_found");
      }
      return c.body(null, 204);
    });
}
