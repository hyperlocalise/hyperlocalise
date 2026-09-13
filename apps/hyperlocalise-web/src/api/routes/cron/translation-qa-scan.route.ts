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
import { env } from "@/lib/env";
import { createLogger } from "@/lib/log";
import { runDueTranslationQaScans } from "@/lib/qa/schedule-due-qa-scans";
import type { TranslationQaScanQueue } from "@/lib/workflow/types";
import { createTranslationQaScanQueue } from "@/workflows/adapters";

const logger = createLogger("cron-translation-qa-scan");

export function createTranslationQaScanRoutes(options: {
  translationQaScanQueue?: TranslationQaScanQueue;
} = {}) {
  const translationQaScanQueue = options.translationQaScanQueue ?? createTranslationQaScanQueue();

  return new Hono().get("/", async (c) => {
    logger.info("cron tick received");

    const auth = verifyCronRequest(c.req.raw);
    if (!auth.ok) {
      if (auth.reason === "misconfigured") {
        logger.warn({ reason: "misconfigured" }, "cron tick rejected; CRON_SECRET is not set");
        return c.json({ error: "translation_qa_scan_misconfigured" }, 503);
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

    const results = await runDueTranslationQaScans({
      limit: env.TRANSLATION_QA_SCAN_MAX_PROJECTS_PER_TICK,
      queue: translationQaScanQueue,
    });

    logger.info(results, "cron tick completed");

    return c.json({ results }, 200);
  });
}
