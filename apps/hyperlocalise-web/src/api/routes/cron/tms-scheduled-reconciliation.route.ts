import { Hono } from "hono";

import { verifyCronRequest } from "@/api/routes/cron/cron-auth";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/log";
import type { ScheduledReconciliationSchedule } from "@/lib/providers/sync/provider-scheduled-reconciliation-config";
import { runScheduledReconciliation } from "@/lib/providers/sync/provider-scheduled-reconciliation";
import type { ProviderWebhookReconciliationQueue } from "@/lib/workflow/types";
import { createProviderWebhookReconciliationQueue } from "@/workflows/adapters";

const logger = createLogger("cron-tms-scheduled-reconciliation");

const scheduleValues = new Set<ScheduledReconciliationSchedule>([
  "incremental",
  "resource_import",
  "full",
  "audit",
]);

function isScheduledReconciliationSchedule(
  value: string,
): value is ScheduledReconciliationSchedule {
  return scheduleValues.has(value as ScheduledReconciliationSchedule);
}

type CreateTmsScheduledReconciliationRoutesOptions = {
  providerWebhookReconciliationQueue?: ProviderWebhookReconciliationQueue;
};

export function createTmsScheduledReconciliationRoutes(
  options: CreateTmsScheduledReconciliationRoutesOptions = {},
) {
  const queue =
    options.providerWebhookReconciliationQueue ?? createProviderWebhookReconciliationQueue();

  return new Hono().get("/", async (c) => {
    logger.info("cron tick received");

    const auth = verifyCronRequest(c.req.raw);
    if (!auth.ok) {
      if (auth.reason === "misconfigured") {
        logger.warn({ reason: "misconfigured" }, "cron tick rejected; CRON_SECRET is not set");
        return c.json({ error: "scheduled_reconciliation_misconfigured" }, 503);
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

    const scheduleParam = c.req.query("schedule");
    const forceSchedule =
      scheduleParam && isScheduledReconciliationSchedule(scheduleParam) ? scheduleParam : undefined;

    if (forceSchedule) {
      logger.info({ forceSchedule }, "running scheduled reconciliation with forced schedule");
    }

    const results = await runScheduledReconciliation({
      queue,
      forceSchedule,
      config: {
        incrementalIntervalMinutes: env.TMS_SCHEDULED_RECONCILIATION_INCREMENTAL_INTERVAL_MINUTES,
        tmGlossaryIntervalMinutes: env.TMS_SCHEDULED_RECONCILIATION_TM_GLOSSARY_INTERVAL_MINUTES,
        fullIntervalMinutes: env.TMS_SCHEDULED_RECONCILIATION_FULL_INTERVAL_MINUTES,
        auditIntervalMinutes: env.TMS_SCHEDULED_RECONCILIATION_AUDIT_INTERVAL_MINUTES,
        fullReconciliationHourUtc: env.TMS_SCHEDULED_RECONCILIATION_FULL_HOUR_UTC,
        auditHourUtc: env.TMS_SCHEDULED_RECONCILIATION_AUDIT_HOUR_UTC,
        maxIntentsPerTick: env.TMS_SCHEDULED_RECONCILIATION_MAX_INTENTS_PER_TICK,
      },
    });

    logger.info(
      {
        scheduleCount: results.length,
        intentsEnqueued: results.reduce((total, result) => total + result.intentsEnqueued, 0),
        intentsSkipped: results.reduce((total, result) => total + result.intentsSkipped, 0),
      },
      "cron tick completed",
    );

    return c.json({ results }, 200);
  });
}
