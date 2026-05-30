import { createLogger } from "@/lib/log";

import {
  advanceGithubRepositoryAutomationNextRun,
  listDueGithubRepositoryAutomationSettings,
} from "./github-repository-automation-settings-store";
import {
  buildGithubRepoAutomationDispatchPayload,
  hasEnabledGithubRepoAutomationWorkflow,
} from "./github-repository-automation-settings";
import { dispatchGithubRepositoryAutomationForSchedule } from "./github-repository-automation-dispatcher";

const logger = createLogger("github-repo-automation-scheduler");

export type GithubRepositoryAutomationSchedulerResult = {
  processed: number;
  enqueued: number;
  skipped: number;
  duplicates: number;
};

export async function runGithubRepositoryAutomationScheduler(input?: {
  now?: Date;
  limit?: number;
}): Promise<GithubRepositoryAutomationSchedulerResult> {
  const now = input?.now ?? new Date();
  const dueSettings = await listDueGithubRepositoryAutomationSettings({
    now,
    limit: input?.limit,
  });

  let enqueued = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const entry of dueSettings) {
    const scheduledRunAt = entry.row.nextRunAt;
    if (!scheduledRunAt) {
      logger.warn(
        { settingsRowId: entry.row.id },
        "github repository automation scheduler row missing next_run_at; advancing",
      );
      await advanceGithubRepositoryAutomationNextRun({
        settingsRowId: entry.row.id,
        settings: entry.settings,
        completedAt: now,
      });
      skipped += 1;
      continue;
    }

    if (!hasEnabledGithubRepoAutomationWorkflow(entry.settings)) {
      await advanceGithubRepositoryAutomationNextRun({
        settingsRowId: entry.row.id,
        settings: entry.settings,
        completedAt: now,
      });
      skipped += 1;
      continue;
    }

    if (entry.settings.trigger?.mode !== "scheduled") {
      await advanceGithubRepositoryAutomationNextRun({
        settingsRowId: entry.row.id,
        settings: entry.settings,
        completedAt: now,
      });
      skipped += 1;
      continue;
    }

    const dispatchPayload = buildGithubRepoAutomationDispatchPayload({
      configVersion: entry.row.configVersion,
      githubInstallationRepositoryId: entry.repository.id,
      organizationId: entry.row.organizationId,
      githubRepositoryId: entry.repository.githubRepositoryId,
      githubInstallationId: entry.repository.githubInstallationId,
      settings: entry.settings,
    });

    if (!dispatchPayload) {
      await advanceGithubRepositoryAutomationNextRun({
        settingsRowId: entry.row.id,
        settings: entry.settings,
        completedAt: now,
      });
      skipped += 1;
      continue;
    }

    const result = await dispatchGithubRepositoryAutomationForSchedule({
      organizationId: entry.row.organizationId,
      githubInstallationId: entry.repository.githubInstallationId,
      githubInstallationRepositoryId: entry.repository.id,
      githubRepositoryId: entry.repository.githubRepositoryId,
      configVersion: entry.row.configVersion,
      scheduledRunAt,
      dispatchPayload,
    });

    await advanceGithubRepositoryAutomationNextRun({
      settingsRowId: entry.row.id,
      settings: entry.settings,
      completedAt: now,
    });

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
      processed: dueSettings.length,
      enqueued,
      skipped,
      duplicates,
    },
    "github repository automation scheduler tick completed",
  );

  return {
    processed: dueSettings.length,
    enqueued,
    skipped,
    duplicates,
  };
}
