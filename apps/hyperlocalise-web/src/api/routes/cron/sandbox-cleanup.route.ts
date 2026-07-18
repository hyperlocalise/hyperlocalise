import { Hono } from "hono";

import { verifyCronRequest } from "@/api/routes/cron/cron-auth";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/log";
import { runSandboxCleanup } from "@/lib/agent-runtime/workspaces/sandbox-cleanup";

const logger = createLogger("cron-sandbox-cleanup");

export function createSandboxCleanupRoutes() {
  return new Hono().get("/", async (c) => {
    logger.info("cron tick received");

    const auth = verifyCronRequest(c.req.raw);
    if (!auth.ok) {
      if (auth.reason === "misconfigured") {
        logger.warn({ reason: "misconfigured" }, "cron tick rejected; CRON_SECRET is not set");
        return c.json({ error: "sandbox_cleanup_misconfigured" }, 503);
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

    const results = await runSandboxCleanup({
      limit: env.SANDBOX_CLEANUP_MAX_PER_TICK,
    });

    logger.info(results, "cron tick completed");

    return c.json({ results }, 200);
  });
}
