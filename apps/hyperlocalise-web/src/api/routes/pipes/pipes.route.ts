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
  forbiddenResponse,
  notFoundResponse,
  serviceUnavailableResponse,
} from "@/api/response.schema";
import { getPipesConnectionStatus } from "@/lib/pipes/status";
import type { PipesStatus } from "@/lib/pipes/types";
import { isErr } from "@/lib/primitives/result/results";

import { pipesProviderParamSchema } from "./pipes.schema";

function canReadPipes(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

const validateProviderParams = validator("param", (value, c) => {
  const parsed = pipesProviderParamSchema.safeParse({ provider: value.provider });
  if (!parsed.success) {
    return notFoundResponse(c, "unknown_pipes_provider");
  }
  return parsed.data;
});

export function createPipesRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/:provider", validateProviderParams, async (c) => {
      if (!canReadPipes(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const { provider } = c.req.valid("param");
      const result = await getPipesConnectionStatus({
        provider,
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });

      if (isErr(result)) {
        return serviceUnavailableResponse(c, result.error.code, result.error.message);
      }

      const pipe: PipesStatus = { provider, ...result.value };
      return c.json({ pipe }, 200);
    });
}
