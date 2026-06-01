import { Hono } from "hono";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import { runGithubRepositoryAutomationScheduler } from "@/lib/agents/github/github-repository-automation-scheduler";
import { runGithubRepositoryAutomationWorker } from "@/lib/agents/github/github-repository-automation-worker";
import { runWorkspaceAutomationScheduler } from "@/lib/agents/workspace-automation-scheduler";

function readCronSecret(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return request.headers.get("x-cron-secret")?.trim() ?? null;
}

const HMAC_KEY = randomBytes(32);

function secretsMatch(provided: string, expected: string) {
  const providedHmac = createHmac("sha256", HMAC_KEY).update(provided).digest();
  const expectedHmac = createHmac("sha256", HMAC_KEY).update(expected).digest();
  return timingSafeEqual(providedHmac, expectedHmac);
}

export function createGithubRepositoryAutomationDispatchRoutes() {
  return new Hono().get("/", async (c) => {
    if (!env.GITHUB_REPOSITORY_AUTOMATION_DISPATCH_ENABLED) {
      return c.json({ error: "github_repository_automation_dispatch_disabled" }, 503);
    }

    const cronSecret = env.GITHUB_REPOSITORY_AUTOMATION_DISPATCH_CRON_SECRET;
    if (!cronSecret) {
      return c.json({ error: "github_repository_automation_dispatch_misconfigured" }, 503);
    }

    const providedSecret = readCronSecret(c.req.raw);
    if (!providedSecret || !secretsMatch(providedSecret, cronSecret)) {
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
