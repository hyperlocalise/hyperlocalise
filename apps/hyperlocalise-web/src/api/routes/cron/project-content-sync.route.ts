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
import { runDueProjectContentSyncs } from "@/lib/projects/content-sync/project-content-sync";
import type { ProjectContentSyncQueue } from "@/lib/workflow/types";
import { createProjectContentSyncQueue } from "@/workflows/adapters";

const logger = createLogger("cron-project-content-sync");

const MAX_SYNCS_PER_TICK = 25;

export function createProjectContentSyncCronRoutes(
  options: {
    projectContentSyncQueue?: ProjectContentSyncQueue;
  } = {},
) {
  const queue = options.projectContentSyncQueue ?? createProjectContentSyncQueue();

  return new Hono().get("/", async (c) => {
    const auth = verifyCronRequest(c.req.raw);
    if (!auth.ok) {
      if (auth.reason === "misconfigured") {
        logger.warn({ reason: "misconfigured" }, "cron tick rejected; CRON_SECRET is not set");
        return c.json({ error: "project_content_sync_misconfigured" }, 503);
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

    const results = await runDueProjectContentSyncs({ limit: MAX_SYNCS_PER_TICK, queue });
    logger.info(results, "cron tick completed");
    return c.json({ results }, 200);
  });
}
