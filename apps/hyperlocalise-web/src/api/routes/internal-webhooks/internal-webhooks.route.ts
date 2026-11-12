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

import { serviceUnavailableResponse, unauthorizedResponse } from "@/api/response.schema";
import { verifyGoSvcServiceToken } from "@/lib/go-svc/go-svc-service-token";
import { createLogger } from "@/lib/log";
import { mintWebhookSigningSecret } from "@/lib/outbound-webhooks/webhook-signing";
import { isErr } from "@/lib/primitives/result/results";

const logger = createLogger("internal-webhooks");

export function createInternalWebhookRoutes() {
  return new Hono()
    .use("*", async (c, next) => {
      const auth = verifyGoSvcServiceToken(c.req.raw);
      if (!auth.ok) {
        if (auth.reason === "misconfigured") {
          logger.warn(
            { reason: "misconfigured" },
            "webhook secret mint rejected; service token is not configured",
          );
          return serviceUnavailableResponse(c, "webhook_secret_mint_misconfigured");
        }
        return unauthorizedResponse(c, "unauthorized", "missing server call token");
      }

      await next();
    })
    .post("/signing-secret", async (c) => {
      const minted = mintWebhookSigningSecret();
      if (isErr(minted)) {
        logger.warn({ code: minted.error.code }, "webhook signing secret mint failed");
        return serviceUnavailableResponse(c, minted.error.code);
      }
      logger.info("minted webhook signing secret for public-api");
      return c.json({ secret: minted.value.secret, encrypted: minted.value.encrypted }, 200);
    });
}
