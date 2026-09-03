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
import { createLogger } from "@/lib/log";

import { dispatchDueScheduledVisualWorkflows } from "./visual-workflow-dispatcher";

const logger = createLogger("visual-workflow-scheduler");

export type VisualWorkflowSchedulerResult = {
  processed: number;
  enqueued: number;
  skipped: number;
  duplicates: number;
};

export async function runVisualWorkflowScheduler(input?: {
  now?: Date;
  limit?: number;
}): Promise<VisualWorkflowSchedulerResult> {
  const results = await dispatchDueScheduledVisualWorkflows({
    now: input?.now,
    limit: input?.limit,
  });

  let enqueued = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const result of results) {
    if (result.outcome === "enqueued") {
      enqueued += 1;
      if (!result.inserted) {
        duplicates += 1;
      }
    } else {
      skipped += 1;
    }
  }

  logger.info(
    {
      processed: results.length,
      enqueued,
      skipped,
      duplicates,
    },
    "visual workflow scheduler tick completed",
  );

  return {
    processed: results.length,
    enqueued,
    skipped,
    duplicates,
  };
}
