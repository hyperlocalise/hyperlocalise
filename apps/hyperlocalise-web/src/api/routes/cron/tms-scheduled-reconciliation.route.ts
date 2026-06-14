import { Hono } from "hono";

import { verifyCronRequest } from "@/api/routes/cron/cron-auth";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/log";
import { scheduleIncrementalProviderSyncIntents } from "@/lib/providers/provider-sync-worker";
import { runProviderSyncWorkflowDispatcher } from "@/lib/providers/provider-sync-workflow-dispatcher";

const logger = createLogger("cron-tms-scheduled-reconciliation");

export function createTmsScheduledReconciliationRoutes() {
  return new Hono().get("/", async (c) => {
    logger.info("tms scheduled reconciliation cron tick received");

    const auth = verifyCronRequest(c.req.raw);
    if (!auth.ok) {
      if (auth.reason === "misconfigured") {
        logger.warn(
          { reason: "misconfigured" },
          "tms scheduled reconciliation cron rejected; CRON_SECRET is not set",
        );
        return c.json({ error: "tms_scheduled_reconciliation_misconfigured" }, 503);
      }

      logger.warn(
        {
          reason: "unauthorized",
          hasAuthorizationHeader: auth.hasAuthorizationHeader,
          hasCronSecretHeader: auth.hasCronSecretHeader,
        },
        "tms scheduled reconciliation cron rejected; missing or invalid cron secret",
      );
      return c.json({ error: "unauthorized" }, 401);
    }

    const schedulerResults = await scheduleIncrementalProviderSyncIntents({
      limit: env.TMS_SCHEDULED_RECONCILIATION_MAX_INTENTS_PER_TICK,
    });
    const dispatcherResults = await runProviderSyncWorkflowDispatcher({
      limit: env.TMS_SCHEDULED_RECONCILIATION_MAX_INTENTS_PER_TICK,
    });

    logger.info(
      {
        scheduler: schedulerResults,
        dispatcher: dispatcherResults,
      },
      "tms scheduled reconciliation cron tick completed",
    );

    return c.json(
      {
        results: {
          scheduler: schedulerResults,
          dispatcher: dispatcherResults,
        },
      },
      200,
    );
  });
}
