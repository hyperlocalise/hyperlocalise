import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const runGithubRepositoryAutomationSchedulerMock = vi.fn(async () => ({
  processed: 1,
  enqueued: 1,
  skipped: 0,
  duplicates: 0,
}));

const runGithubRepositoryAutomationWorkerMock = vi.fn(async () => ({
  processed: 1,
  started: 1,
  skipped: 0,
}));

const runWorkspaceAutomationSchedulerMock = vi.fn(async () => ({
  processed: 1,
  enqueued: 1,
  skipped: 0,
  duplicates: 0,
}));

async function createClient(input?: { enabled?: boolean; cronSecret?: string | null }) {
  vi.resetModules();
  vi.doMock("@/lib/agents/github/github-repository-automation-scheduler", () => ({
    runGithubRepositoryAutomationScheduler: runGithubRepositoryAutomationSchedulerMock,
  }));
  vi.doMock("@/lib/agents/github/github-repository-automation-worker", () => ({
    runGithubRepositoryAutomationWorker: runGithubRepositoryAutomationWorkerMock,
  }));
  vi.doMock("@/lib/agents/workspace-automation-scheduler", () => ({
    runWorkspaceAutomationScheduler: runWorkspaceAutomationSchedulerMock,
  }));
  vi.doMock("@/lib/env", () => ({
    env: {
      GITHUB_REPOSITORY_AUTOMATION_DISPATCH_ENABLED: input?.enabled ?? true,
      GITHUB_REPOSITORY_AUTOMATION_DISPATCH_CRON_SECRET:
        input?.cronSecret === null ? undefined : (input?.cronSecret ?? "cron-secret"),
      GITHUB_REPOSITORY_AUTOMATION_DISPATCH_MAX_REPOS_PER_TICK: 100,
    },
  }));

  const { createGithubRepositoryAutomationDispatchRoutes } =
    await import("./github-repository-automation-dispatch.route");

  return testClient(createGithubRepositoryAutomationDispatchRoutes());
}

describe("github repository automation dispatch cron route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/agents/github/github-repository-automation-scheduler");
    vi.doUnmock("@/lib/agents/github/github-repository-automation-worker");
    vi.doUnmock("@/lib/agents/workspace-automation-scheduler");
    vi.doUnmock("@/lib/env");
    runGithubRepositoryAutomationSchedulerMock.mockClear();
    runGithubRepositoryAutomationWorkerMock.mockClear();
    runWorkspaceAutomationSchedulerMock.mockClear();
  });

  it("rejects requests without the cron secret", async () => {
    const client = await createClient();

    const response = await client.index.$get();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("runs scheduled github automation dispatch when authorized", async () => {
    const client = await createClient();

    const response = await client.index.$get(
      {},
      {
        headers: {
          authorization: "Bearer cron-secret",
        },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: {
        scheduler: {
          processed: 1,
          enqueued: 1,
          skipped: 0,
          duplicates: 0,
        },
        workspaceAutomationScheduler: {
          processed: 1,
          enqueued: 1,
          skipped: 0,
          duplicates: 0,
        },
        worker: {
          processed: 1,
          started: 1,
          skipped: 0,
        },
      },
    });
    expect(runGithubRepositoryAutomationSchedulerMock).toHaveBeenCalledTimes(1);
    expect(runWorkspaceAutomationSchedulerMock).toHaveBeenCalledTimes(1);
    expect(runGithubRepositoryAutomationWorkerMock).toHaveBeenCalledTimes(1);
  });

  it("returns disabled when github automation dispatch is turned off", async () => {
    const client = await createClient({ enabled: false });

    const response = await client.index.$get(
      {},
      {
        headers: {
          authorization: "Bearer cron-secret",
        },
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "github_repository_automation_dispatch_disabled",
    });
  });
});
