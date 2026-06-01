import { createLogger } from "@/lib/log";

import { dispatchWorkspaceAutomationForScheduleAndAdvance } from "./workspace-automation-dispatcher";
import { hasWorkspaceAutomationGithubWorkflow } from "./workspace-automation-github-mapping";
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
          repository: {
            id: entry.repository.id,
            githubInstallationId: entry.repository.githubInstallationId,
            githubRepositoryId: entry.repository.githubRepositoryId,
          },
          scheduledRunAt: now,
          completedAt: now,
        });
        skipped += 1;
        continue;
      }

      if (!hasWorkspaceAutomationGithubWorkflow(entry.automation.toolConfig)) {
        await dispatchWorkspaceAutomationForScheduleAndAdvance({
          automation: entry.automation,
          repository: {
            id: entry.repository.id,
            githubInstallationId: entry.repository.githubInstallationId,
            githubRepositoryId: entry.repository.githubRepositoryId,
          },
          scheduledRunAt,
          completedAt: now,
        });
        skipped += 1;
        continue;
      }

      if (entry.automation.triggerConfig.mode !== "scheduled") {
        await dispatchWorkspaceAutomationForScheduleAndAdvance({
          automation: entry.automation,
          repository: {
            id: entry.repository.id,
            githubInstallationId: entry.repository.githubInstallationId,
            githubRepositoryId: entry.repository.githubRepositoryId,
          },
          scheduledRunAt,
          completedAt: now,
        });
        skipped += 1;
        continue;
      }

      const result = await dispatchWorkspaceAutomationForScheduleAndAdvance({
        automation: entry.automation,
        repository: {
          id: entry.repository.id,
          githubInstallationId: entry.repository.githubInstallationId,
          githubRepositoryId: entry.repository.githubRepositoryId,
        },
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
      processed: dueAutomations.length,
      enqueued,
      skipped,
      duplicates,
    },
    "workspace automation scheduler tick completed",
  );

  return {
    processed: dueAutomations.length,
    enqueued,
    skipped,
    duplicates,
  };
}
