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
import { createLogger } from "@/lib/log";
import { captureEditorSaves } from "@/lib/reporting/editor-save-capture";
import { refreshReportingSummary } from "@/lib/reporting/summary";

const logger = createLogger("cron-reporting-capture");
/**
 * A run starts no new work after this long, a minute inside the 300 s function limit
 * (`maxDuration` in the API catch-all route), so it ends cleanly and keeps its finished work.
 */
const RUN_TIME_BUDGET_MS = 240_000;
/** Recording saves stops here, leaving the rest of the run to refreshing the daily summary. */
const CAPTURE_TIME_BUDGET_MS = 180_000;

export function createReportingCaptureRoutes() {
  return new Hono().get("/", async (c) => {
    logger.info("cron tick received");

    const auth = verifyCronRequest(c.req.raw);
    if (!auth.ok) {
      if (auth.reason === "misconfigured") {
        logger.warn({ reason: "misconfigured" }, "cron tick rejected; CRON_SECRET is not set");
        return c.json({ error: "reporting_capture_misconfigured" }, 503);
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

    const startedAt = Date.now();
    const capture = await captureEditorSaves({
      signal: AbortSignal.timeout(CAPTURE_TIME_BUDGET_MS),
    });
    // Saves recorded above, and work recorded by jobs since the last run, reach the summary now.
    // Capture's work is already saved, so a failed refresh is logged and retried next run.
    const summary = await refreshReportingSummary({
      signal: AbortSignal.timeout(Math.max(0, RUN_TIME_BUDGET_MS - (Date.now() - startedAt))),
    }).catch((error: unknown) => {
      logger.error({ error }, "reporting summary refresh failed");
      return { error: "reporting_summary_refresh_failed" as const };
    });
    const results = { ...capture, summary };
    logger.info(results, "cron tick completed");
    return c.json({ results }, 200);
  });
}
