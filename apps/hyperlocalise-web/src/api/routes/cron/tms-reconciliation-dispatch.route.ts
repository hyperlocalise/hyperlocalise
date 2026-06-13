import { Hono } from "hono";

import { verifyCronRequest } from "@/api/routes/cron/cron-auth";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/log";
import { isTmsHybridSyncEnabled } from "@/lib/providers/tms-hybrid-sync-mode";
import {
  runProviderSyncWorker,
  scheduleIncrementalProviderSyncIntents,
} from "@/lib/providers/provider-sync-worker";

const logger = createLogger("cron-tms-reconciliation-dispatch");

export function createTmsReconciliationDispatchRoutes() {
  return new Hono().get("/", async (c) => {
    logger.info("tms reconciliation cron tick received");

    const auth = verifyCronRequest(c.req.raw);
    if (!auth.ok) {
      if (auth.reason === "misconfigured") {
        logger.warn(
          { reason: "misconfigured" },
          "tms reconciliation cron rejected; CRON_SECRET is not set",
        );
        return c.json({ error: "tms_reconciliation_dispatch_misconfigured" }, 503);
      }

      logger.warn(
        {
          reason: "unauthorized",
          hasAuthorizationHeader: auth.hasAuthorizationHeader,
          hasCronSecretHeader: auth.hasCronSecretHeader,
        },
        "tms reconciliation cron rejected; missing or invalid cron secret",
      );
      return c.json({ error: "unauthorized" }, 401);
    }

    if (!isTmsHybridSyncEnabled()) {
      return c.json(
        {
          results: {
            worker: { processed: 0, succeeded: 0, failed: 0, skipped: 0 },
            scheduler: { enqueued: 0, skipped: 0 },
            disabled: true,
          },
        },
        200,
      );
    }

    const schedulerResults = await scheduleIncrementalProviderSyncIntents({
      limit: env.TMS_SCHEDULED_RECONCILIATION_MAX_INTENTS_PER_TICK,
    });
    const workerResults = await runProviderSyncWorker({
      limit: env.TMS_SCHEDULED_RECONCILIATION_MAX_INTENTS_PER_TICK,
    });

    logger.info(
      {
        scheduler: schedulerResults,
        worker: workerResults,
      },
      "tms reconciliation cron tick completed",
    );

    return c.json(
      {
        results: {
          scheduler: schedulerResults,
          worker: workerResults,
        },
      },
      200,
    );
  });
}
