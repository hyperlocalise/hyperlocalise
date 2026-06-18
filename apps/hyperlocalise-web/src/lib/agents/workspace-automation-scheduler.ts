import { createLogger } from "@/lib/log";

import {
  dispatchDueContentfulWorkspaceAutomations,
  dispatchWorkspaceAutomationForScheduleAndAdvance,
} from "./workspace-automation-dispatcher";
import { buildWorkspaceOrchestratorPlan } from "@/agents/automations/workspace/agent/plan";
import { listDueWorkspaceAutomations } from "./workspace-automations";

const logger = createLogger("workspace-automation-scheduler");

export type WorkspaceAutomationSchedulerResult = {
  processed: number;
  enqueued: number;
  skipped: number;
  duplicates: number;
};

export async function runWorkspaceAutomationScheduler(input?: {
  now?: Date;
  limit?: number;
}): Promise<WorkspaceAutomationSchedulerResult> {
  const now = input?.now ?? new Date();
  const dueAutomations = await listDueWorkspaceAutomations({
    now,
    limit: input?.limit,
  });
  const contentfulResults = await dispatchDueContentfulWorkspaceAutomations({
    now,
    limit: input?.limit,
  });

  let enqueued = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const entry of dueAutomations) {
    try {
      const scheduledRunAt = entry.automation.nextRunAt
        ? new Date(entry.automation.nextRunAt)
        : null;
      if (!scheduledRunAt) {
        logger.warn(
          { automationId: entry.automation.id },
          "workspace automation missing next_run_at; advancing",
        );
        await dispatchWorkspaceAutomationForScheduleAndAdvance({
          automation: entry.automation,
          scheduledRunAt: now,
          completedAt: now,
        });
        skipped += 1;
        continue;
      }

      if (entry.automation.triggerConfig.mode !== "scheduled") {
        await dispatchWorkspaceAutomationForScheduleAndAdvance({
          automation: entry.automation,
          scheduledRunAt,
          completedAt: now,
        });
        skipped += 1;
        continue;
      }

      const plan = buildWorkspaceOrchestratorPlan(entry.automation);
      if (plan.tools.length === 0) {
        await dispatchWorkspaceAutomationForScheduleAndAdvance({
          automation: entry.automation,
          scheduledRunAt,
          completedAt: now,
        });
        skipped += 1;
        continue;
      }

      const result = await dispatchWorkspaceAutomationForScheduleAndAdvance({
        automation: entry.automation,
        scheduledRunAt,
        completedAt: now,
      });

      if (!result) {
        skipped += 1;
        continue;
      }

      if (result.outcome === "enqueued") {
        enqueued += 1;
        if (!result.inserted) {
          duplicates += 1;
        }
      } else {
        skipped += 1;
      }
    } catch (error) {
      logger.error(
        {
          automationId: entry.automation.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "workspace automation scheduler entry failed",
      );
      skipped += 1;
    }
  }

  logger.info(
    {
      processed: dueAutomations.length + contentfulResults.length,
      enqueued,
      skipped,
      duplicates,
      contentfulEnqueued: contentfulResults.filter((result) => result.outcome === "enqueued")
        .length,
    },
    "workspace automation scheduler tick completed",
  );

  return {
    processed: dueAutomations.length + contentfulResults.length,
    enqueued: enqueued + contentfulResults.filter((result) => result.outcome === "enqueued").length,
    skipped: skipped + contentfulResults.filter((result) => result.outcome === "skipped").length,
    duplicates,
  };
}
