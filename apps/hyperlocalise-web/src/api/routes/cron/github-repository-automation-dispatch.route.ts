import { Hono } from "hono";

import { verifyCronRequest } from "@/api/routes/cron/cron-auth";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/log";
import { runGithubRepositoryAutomationScheduler } from "@/lib/agents/github/github-repository-automation-scheduler";
import { runGithubRepositoryAutomationWorker } from "@/lib/agents/github/github-repository-automation-worker";
import { runWorkspaceAutomationScheduler } from "@/lib/agents/workspace-automation-scheduler";

const logger = createLogger("cron-github-repository-automation-dispatch");

export function createGithubRepositoryAutomationDispatchRoutes() {
  return new Hono().get("/", async (c) => {
    logger.info("cron tick received");

    const auth = verifyCronRequest(c.req.raw);
    if (!auth.ok) {
      if (auth.reason === "misconfigured") {
        logger.warn({ reason: "misconfigured" }, "cron tick rejected; CRON_SECRET is not set");
        return c.json({ error: "github_repository_automation_dispatch_misconfigured" }, 503);
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

    const schedulerResults = await runGithubRepositoryAutomationScheduler({
      limit: env.GITHUB_REPOSITORY_AUTOMATION_DISPATCH_MAX_REPOS_PER_TICK,
    });
    const workspaceAutomationSchedulerResults = await runWorkspaceAutomationScheduler({
      limit: env.GITHUB_REPOSITORY_AUTOMATION_DISPATCH_MAX_REPOS_PER_TICK,
    });

    const workerResults = await runGithubRepositoryAutomationWorker({
      limit: env.GITHUB_REPOSITORY_AUTOMATION_DISPATCH_MAX_REPOS_PER_TICK,
    });

    logger.info(
      {
        scheduler: {
          processed: schedulerResults.processed,
          enqueued: schedulerResults.enqueued,
          skipped: schedulerResults.skipped,
        },
        workspaceAutomationScheduler: {
          processed: workspaceAutomationSchedulerResults.processed,
          enqueued: workspaceAutomationSchedulerResults.enqueued,
          skipped: workspaceAutomationSchedulerResults.skipped,
        },
        worker: {
          processed: workerResults.processed,
          started: workerResults.started,
          skipped: workerResults.skipped,
        },
      },
      "cron tick completed",
    );

    return c.json(
      {
        results: {
          scheduler: schedulerResults,
          workspaceAutomationScheduler: workspaceAutomationSchedulerResults,
          worker: workerResults,
        },
      },
      200,
    );
  });
}
