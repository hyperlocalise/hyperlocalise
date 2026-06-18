import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { claimGithubRepositoryAutomationJob } from "./github/github-repository-automation-jobs";
import { syncWorkspaceAutomationRunsForGithubJob } from "./workspace-automation-run-sync";
import {
  createWorkspaceAutomation,
  createWorkspaceAutomationRun,
  listWorkspaceAutomationRuns,
} from "./workspace-automations";

const organizationIds: string[] = [];

function expectOk<T, E>(result: { ok: true; value: T } | { ok: false; error: E }): T {
  if (!result.ok) {
    throw new Error("expected ok result");
  }
  return result.value;
}

async function seedRunSyncScope() {
  const organizationId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const numericSuffix = BigInt(`0x${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`)
    .toString()
    .slice(0, 12);
  const githubInstallationId = `7${numericSuffix}`;
  const githubRepositoryId = `6${numericSuffix}`;

  organizationIds.push(organizationId);

  await db.insert(schema.organizations).values({
    id: organizationId,
    workosOrganizationId: `org_${organizationId}`,
    slug: `workspace-run-sync-${organizationId.slice(0, 8)}`,
    name: "Workspace Run Sync Test Org",
  });

  await db.insert(schema.users).values({
    id: userId,
    workosUserId: `user_${userId}`,
    email: `${userId}@example.test`,
  });

  await db.insert(schema.githubInstallations).values({
    organizationId,
    githubInstallationId,
    githubAppId: "123",
    accountLogin: "hyperlocalise",
    accountType: "Organization",
  });

  const [repository] = await db
    .insert(schema.githubInstallationRepositories)
    .values({
      organizationId,
      githubInstallationId,
      githubRepositoryId,
      owner: "hyperlocalise",
      name: "web",
      fullName: "hyperlocalise/web",
      private: false,
      archived: false,
      defaultBranch: "main",
      enabled: true,
    })
    .returning();

  if (!repository) {
    throw new Error("failed to seed github installation repository");
  }

  return {
    organizationId,
    userId,
    githubInstallationId,
    githubRepositoryId,
    githubInstallationRepositoryId: repository.id,
  };
}

describe("workspace automation run sync", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    for (const organizationId of organizationIds.splice(0)) {
      await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    }
  });

  it("does not overwrite orchestrator-managed terminal workspace runs from github job sync", async () => {
    const scope = await seedRunSyncScope();
    const automation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Repository automation",
        instructions: "Run repository automation.",
      }),
    );
    const { job } = await claimGithubRepositoryAutomationJob({
      idempotencyKey: `workspace-automation:${crypto.randomUUID()}`,
      organizationId: scope.organizationId,
      githubInstallationRepositoryId: scope.githubInstallationRepositoryId,
      githubInstallationId: scope.githubInstallationId,
      githubRepositoryId: scope.githubRepositoryId,
      configVersion: 1,
      triggerMode: "scheduled",
      scheduledRunAt: new Date("2026-06-01T12:00:00.000Z"),
    });

    await createWorkspaceAutomationRun({
      automationId: automation.id,
      organizationId: scope.organizationId,
      triggerSource: "scheduled",
      status: "running",
      githubRepositoryAutomationJobId: job.id,
      startedAt: new Date("2026-06-01T12:01:00.000Z"),
      outputSummary: {
        orchestratorEnqueuedAt: "2026-06-01T12:00:30.000Z",
      },
    });

    await syncWorkspaceAutomationRunsForGithubJob({
      jobId: job.id,
      status: "succeeded",
      resultSummary: { changedFiles: 2 },
      completedAt: new Date("2026-06-01T12:02:00.000Z"),
    });

    const [syncedRun] = await listWorkspaceAutomationRuns({
      automationId: automation.id,
      organizationId: scope.organizationId,
    });
    expect(syncedRun).toMatchObject({
      status: "running",
      outputSummary: {
        orchestratorEnqueuedAt: "2026-06-01T12:00:30.000Z",
      },
    });
  });

  it("still syncs legacy workspace runs without orchestrator metadata", async () => {
    const scope = await seedRunSyncScope();
    const automation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Repository automation",
        instructions: "Run repository automation.",
      }),
    );
    const { job } = await claimGithubRepositoryAutomationJob({
      idempotencyKey: `workspace-automation:${crypto.randomUUID()}`,
      organizationId: scope.organizationId,
      githubInstallationRepositoryId: scope.githubInstallationRepositoryId,
      githubInstallationId: scope.githubInstallationId,
      githubRepositoryId: scope.githubRepositoryId,
      configVersion: 1,
      triggerMode: "scheduled",
      scheduledRunAt: new Date("2026-06-01T12:00:00.000Z"),
    });

    await createWorkspaceAutomationRun({
      automationId: automation.id,
      organizationId: scope.organizationId,
      triggerSource: "scheduled",
      status: "running",
      githubRepositoryAutomationJobId: job.id,
      startedAt: new Date("2026-06-01T12:01:00.000Z"),
    });

    const completedAt = new Date("2026-06-01T12:02:00.000Z");
    await syncWorkspaceAutomationRunsForGithubJob({
      jobId: job.id,
      status: "succeeded",
      resultSummary: { changedFiles: 2 },
      completedAt,
    });

    const [syncedRun] = await listWorkspaceAutomationRuns({
      automationId: automation.id,
      organizationId: scope.organizationId,
    });
    expect(syncedRun).toMatchObject({
      status: "succeeded",
      outputSummary: {
        changedFiles: 2,
      },
      completedAt: completedAt.toISOString(),
    });
  });
});
