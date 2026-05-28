import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import type { ScheduledReconciliationSchedule } from "@/lib/providers/provider-scheduled-reconciliation-config";
import { runScheduledReconciliation } from "@/lib/providers/provider-scheduled-reconciliation";
import type { ProviderWebhookReconciliationQueue } from "@/lib/workflow/types";
import { createProviderWebhookReconciliationQueue } from "@/workflows/adapters";

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

function readCronSecret(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return request.headers.get("x-cron-secret")?.trim() ?? null;
}

function secretsMatch(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

type CreateTmsScheduledReconciliationRoutesOptions = {
  providerWebhookReconciliationQueue?: ProviderWebhookReconciliationQueue;
};

export function createTmsScheduledReconciliationRoutes(
  options: CreateTmsScheduledReconciliationRoutesOptions = {},
) {
  const queue =
    options.providerWebhookReconciliationQueue ?? createProviderWebhookReconciliationQueue();

  return new Hono().post("/", async (c) => {
    if (!env.TMS_SCHEDULED_RECONCILIATION_ENABLED) {
      return c.json({ error: "scheduled_reconciliation_disabled" }, 503);
    }

    const cronSecret = env.TMS_SCHEDULED_RECONCILIATION_CRON_SECRET;
    if (!cronSecret) {
      return c.json({ error: "scheduled_reconciliation_misconfigured" }, 503);
    }

    const providedSecret = readCronSecret(c.req.raw);
    if (!providedSecret || !secretsMatch(providedSecret, cronSecret)) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const scheduleParam = c.req.query("schedule");
    const forceSchedule =
      scheduleParam && isScheduledReconciliationSchedule(scheduleParam) ? scheduleParam : undefined;

    const results = await runScheduledReconciliation({
      queue,
      forceSchedule,
      config: {
        enabled: env.TMS_SCHEDULED_RECONCILIATION_ENABLED,
        incrementalIntervalMinutes: env.TMS_SCHEDULED_RECONCILIATION_INCREMENTAL_INTERVAL_MINUTES,
        tmGlossaryIntervalMinutes: env.TMS_SCHEDULED_RECONCILIATION_TM_GLOSSARY_INTERVAL_MINUTES,
        fullIntervalMinutes: env.TMS_SCHEDULED_RECONCILIATION_FULL_INTERVAL_MINUTES,
        auditIntervalMinutes: env.TMS_SCHEDULED_RECONCILIATION_AUDIT_INTERVAL_MINUTES,
        fullReconciliationHourUtc: env.TMS_SCHEDULED_RECONCILIATION_FULL_HOUR_UTC,
        auditHourUtc: env.TMS_SCHEDULED_RECONCILIATION_AUDIT_HOUR_UTC,
        maxIntentsPerTick: env.TMS_SCHEDULED_RECONCILIATION_MAX_INTENTS_PER_TICK,
      },
    });

    return c.json({ results }, 200);
  });
}

export const tmsScheduledReconciliationRoutes = createTmsScheduledReconciliationRoutes();
