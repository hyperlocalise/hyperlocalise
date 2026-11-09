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

import {
  apiErrorResponse,
  badRequestResponse,
  notFoundResponse,
  serviceUnavailableResponse,
  unauthorizedResponse,
} from "@/api/response.schema";
import { mintExternalTmsAccessTokenBodySchema } from "@/api/routes/internal-tms/internal-tms.schema";
import { verifyGoSvcServiceToken } from "@/lib/go-svc/go-svc-service-token";
import { createLogger } from "@/lib/log";
import {
  ExternalTmsAccessTokenError,
  mintExternalTmsAccessToken,
} from "@/lib/providers/credentials/external-tms-access-token";

const logger = createLogger("internal-tms");

export function createInternalTmsRoutes() {
  return new Hono()
    .use("*", async (c, next) => {
      const auth = verifyGoSvcServiceToken(c.req.raw);
      if (!auth.ok) {
        if (auth.reason === "misconfigured") {
          logger.warn(
            { reason: "misconfigured" },
            "TMS mint rejected; service token is not configured",
          );
          return serviceUnavailableResponse(c, "tms_access_token_misconfigured");
        }
        return unauthorizedResponse(c, "unauthorized", "missing server call token");
      }

      await next();
    })
    .post(
      "/access-token",
      validator("json", (value, c) => {
        const parsed = mintExternalTmsAccessTokenBodySchema.safeParse(value);
        if (!parsed.success) {
          return badRequestResponse(c, "invalid_tms_access_token_payload");
        }
        return parsed.data;
      }),
      async (c) => {
        const body = c.req.valid("json");

        try {
          const tmsAccessToken = await mintExternalTmsAccessToken(body);
          logger.info(
            {
              organizationId: body.organizationId,
              providerKind: tmsAccessToken.providerKind,
              credentialId: tmsAccessToken.credentialId,
              authMode: tmsAccessToken.authMode,
              actorPresent: Boolean(body.actorUserId),
            },
            "minted TMS access token for go-svc",
          );
          return c.json({ tmsAccessToken }, 200);
        } catch (error) {
          if (error instanceof ExternalTmsAccessTokenError) {
            logger.warn(
              {
                organizationId: body.organizationId,
                providerKind: body.providerKind,
                credentialId: body.credentialId ?? null,
                code: error.code,
              },
              "TMS access token mint failed",
            );
            if (error.status === 404) {
              return notFoundResponse(c, error.code, error.message);
            }
            return apiErrorResponse(c, error.status, error.code, error.message);
          }
          throw error;
        }
      },
    );
}
