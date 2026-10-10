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

import { verifyCronRequest } from "@/api/routes/cron/cron-auth";
import { createGoSvcServerClient } from "@/lib/go-svc/go-svc-server-client";
import { createLogger } from "@/lib/log";

const logger = createLogger("cron-guideline-ingest-sweep");

function goSvcErrorCode(error: unknown) {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "unknown_error";
}

export function createGuidelineIngestSweepRoutes() {
  return new Hono().get("/", async (c) => {
    const auth = verifyCronRequest(c.req.raw);
    if (!auth.ok) {
      if (auth.reason === "misconfigured") {
        logger.warn({ reason: "misconfigured" }, "cron tick rejected; CRON_SECRET is not set");
        return c.json({ error: "guideline_ingest_sweep_misconfigured" }, 503);
      }

      logger.warn(
        {
          reason: "unauthorized",
          hasAuthorizationHeader: auth.hasAuthorizationHeader,
          hasCronSecretHeader: auth.hasCronSecretHeader,
        },
        "cron tick rejected; missing or invalid cron secret",
      );
      return c.json({ error: "unauthorized" }, 401);
    }

    try {
      const results = await createGoSvcServerClient().guidelines.sweep();
      logger.info(results, "cron tick completed");
      return c.json({ results }, 200);
    } catch (error) {
      const code = goSvcErrorCode(error);
      logger.error({ code }, "guideline ingest sweep failed");
      return c.json({ error: "guideline_ingest_sweep_failed", code }, 502);
    }
  });
}
