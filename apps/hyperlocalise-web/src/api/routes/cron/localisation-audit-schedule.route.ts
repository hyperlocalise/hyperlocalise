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
import { localisationAuditDailyRunLimit } from "@/lib/localisation-audit/daily-quota";
import { runScheduledLocalisationAudits } from "@/lib/localisation-audit/run-scheduled-localisation-audits";
import { createLogger } from "@/lib/log";
import type { LocalisationAuditQueue } from "@/lib/workflow/types";
import { createLocalisationAuditQueue } from "@/workflows/adapters";

const logger = createLogger("cron-localisation-audit-schedule");

const SCHEDULE_TIME_ZONE = "Australia/Sydney";
const SCHEDULE_LOCAL_HOUR = 0;

/**
 * Vercel crons run in UTC, so the cron fires at 13:00 and 14:00 UTC and only the
 * tick that lands at midnight in Sydney (AEDT or AEST) starts audits.
 */
function isScheduledLocalHour(date: Date) {
  const hour = new Intl.DateTimeFormat("en-AU", {
    timeZone: SCHEDULE_TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23",
  }).format(date);
  return Number(hour) === SCHEDULE_LOCAL_HOUR;
}

export function createLocalisationAuditScheduleRoutes(
  options: {
    localisationAuditQueue?: LocalisationAuditQueue;
  } = {},
) {
  const localisationAuditQueue = options.localisationAuditQueue ?? createLocalisationAuditQueue();

  return new Hono().get("/", async (c) => {
    logger.info("cron tick received");

    const auth = verifyCronRequest(c.req.raw);
    if (!auth.ok) {
      if (auth.reason === "misconfigured") {
        logger.warn({ reason: "misconfigured" }, "cron tick rejected; CRON_SECRET is not set");
        return c.json({ error: "localisation_audit_schedule_misconfigured" }, 503);
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

    if (!isScheduledLocalHour(new Date())) {
      logger.info({ timeZone: SCHEDULE_TIME_ZONE }, "cron tick skipped; not local midnight");
      return c.json({ skipped: "not_local_midnight" }, 200);
    }

    const results = await runScheduledLocalisationAudits({
      limit: localisationAuditDailyRunLimit("scheduled"),
      queue: localisationAuditQueue,
    });

    logger.info(results, "cron tick completed");

    return c.json({ results }, 200);
  });
}
