import { createLogger } from "@/lib/log";
import { createGithubRepositoryAutomationQueue } from "@/workflows/adapters";

import { listQueuedGithubRepositoryAutomationJobs } from "./github-repository-automation-jobs";

const logger = createLogger("github-repo-automation-worker");

export async function enqueueGithubRepositoryAutomationValidationJob(input: {
  jobId: string;
}): Promise<{ enqueued: boolean }> {
  const queue = createGithubRepositoryAutomationQueue();

  try {
    const result = await queue.enqueue({ jobId: input.jobId });
    return { enqueued: result.ids.length > 0 };
  } catch {
    logger.warn({ jobId: input.jobId }, "failed to enqueue github repository automation workflow");
    return { enqueued: false };
  }
}

export type GithubRepositoryAutomationWorkerResult = {
  processed: number;
  started: number;
  skipped: number;
};

export async function runGithubRepositoryAutomationWorker(input?: {
  limit?: number;
}): Promise<GithubRepositoryAutomationWorkerResult> {
  const queue = createGithubRepositoryAutomationQueue();
  const jobs = await listQueuedGithubRepositoryAutomationJobs({ limit: input?.limit ?? 10 });

  let started = 0;
  let skipped = 0;

  for (const job of jobs) {
    if (!job.workflows.validation) {
      skipped += 1;
      continue;
    }

    try {
      const result = await queue.enqueue({ jobId: job.id });
      if (result.ids.length > 0) {
        started += 1;
      } else {
        skipped += 1;
      }
    } catch {
      logger.warn({ jobId: job.id }, "failed to enqueue github repository automation workflow");
      skipped += 1;
    }
  }

  logger.info(
    {
      processed: jobs.length,
      started,
      skipped,
    },
    "github repository automation worker tick completed",
  );

  return {
    processed: jobs.length,
    started,
    skipped,
  };
}
