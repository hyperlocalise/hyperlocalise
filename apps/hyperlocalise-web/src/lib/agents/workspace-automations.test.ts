import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { claimGithubRepositoryAutomationJob } from "./github/github-repository-automation-jobs";
import {
  createWorkspaceAutomation,
  createWorkspaceAutomationRun,
  listWorkspaceAutomations,
  listWorkspaceAutomationRuns,
  pauseWorkspaceAutomation,
  updateWorkspaceAutomation,
  updateWorkspaceAutomationRun,
} from "./workspace-automations";

const organizationIds: string[] = [];

async function seedWorkspaceAutomationScope() {
  const organizationId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const numericSuffix = BigInt(`0x${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`)
    .toString()
    .slice(0, 12);
  const githubInstallationId = `7${numericSuffix}`;
  const githubRepositoryId = `6${numericSuffix}`;
  const projectId = `project-${organizationId.slice(0, 8)}`;

  organizationIds.push(organizationId);

  await db.insert(schema.organizations).values({
    id: organizationId,
    workosOrganizationId: `org_${organizationId}`,
    slug: `workspace-automation-${organizationId.slice(0, 8)}`,
    name: "Workspace Automation Test Org",
  });

  await db.insert(schema.users).values({
    id: userId,
    workosUserId: `user_${userId}`,
    email: `${userId}@example.test`,
  });

  await db.insert(schema.projects).values({
    id: projectId,
    organizationId,
    createdByUserId: userId,
    name: "Website",
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
    projectId,
    githubInstallationId,
    githubRepositoryId,
    githubInstallationRepositoryId: repository.id,
  };
}

describe("workspace automations", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    for (const organizationId of organizationIds.splice(0)) {
      await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    }
  });

  it("creates automations with safe defaults and serializes next-run storage", async () => {
    const scope = await seedWorkspaceAutomationScope();
    const nextRunAt = new Date("2026-06-01T12:00:00.000Z");

    const automation = await createWorkspaceAutomation({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Refresh repository translations",
      instructions: "Pull the latest source strings and prepare translation updates.",
      nextRunAt,
    });

    expect(automation).toMatchObject({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      status: "active",
      name: "Refresh repository translations",
      triggerConfig: { mode: "manual" },
      repositoryTarget: { kind: "none" },
      toolConfig: {},
      configVersion: 1,
      nextRunAt: nextRunAt.toISOString(),
    });

    const [listed] = await listWorkspaceAutomations({ organizationId: scope.organizationId });
    expect(listed?.id).toBe(automation.id);
  });

  it("rejects enabled GitHub tools without project and repository config", async () => {
    const scope = await seedWorkspaceAutomationScope();

    await expect(
      createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Broken GitHub automation",
        instructions: "Run GitHub automation.",
        toolConfig: { github: { enabled: true, pushSource: true } },
      }),
    ).rejects.toThrow("github_repository_target_required");

    await expect(
      createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Broken GitHub automation",
        instructions: "Run GitHub automation.",
        repositoryTarget: {
          kind: "github",
          githubInstallationRepositoryId: scope.githubInstallationRepositoryId,
        },
        toolConfig: { github: { enabled: true, pushSource: true } },
      }),
    ).rejects.toThrow("github_project_required");
  });

  it("updates, versions, and pauses automations", async () => {
    const scope = await seedWorkspaceAutomationScope();
    const automation = await createWorkspaceAutomation({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Repository automation",
      instructions: "Run repository automation.",
      repositoryTarget: {
        kind: "github",
        githubInstallationRepositoryId: scope.githubInstallationRepositoryId,
      },
      toolConfig: {
        github: {
          enabled: true,
          projectId: scope.projectId,
          pushSource: true,
          pullTranslations: false,
          validation: true,
        },
      },
      nextRunAt: new Date("2026-06-01T12:00:00.000Z"),
    });

    const updated = await updateWorkspaceAutomation({
      automationId: automation.id,
      organizationId: scope.organizationId,
      name: "Updated repository automation",
      nextRunAt: new Date("2026-06-02T12:00:00.000Z"),
    });
    const paused = await pauseWorkspaceAutomation({
      automationId: automation.id,
      organizationId: scope.organizationId,
    });

    expect(updated?.configVersion).toBe(2);
    expect(updated?.name).toBe("Updated repository automation");
    expect(paused?.status).toBe("paused");
    expect(paused?.configVersion).toBe(3);
    expect(paused?.nextRunAt).toBeNull();
  });

  it("creates and serializes run history with optional GitHub job links", async () => {
    const scope = await seedWorkspaceAutomationScope();
    const automation = await createWorkspaceAutomation({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Repository automation",
      instructions: "Run repository automation.",
    });
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
    const startedAt = new Date("2026-06-01T12:01:00.000Z");
    const completedAt = new Date("2026-06-01T12:02:00.000Z");

    const run = await createWorkspaceAutomationRun({
      automationId: automation.id,
      organizationId: scope.organizationId,
      triggerSource: "scheduled",
      status: "running",
      inputSnapshot: { commit: "abc123" },
      githubRepositoryAutomationJobId: job.id,
      startedAt,
    });
    const completed = await updateWorkspaceAutomationRun({
      runId: run.id,
      organizationId: scope.organizationId,
      status: "succeeded",
      outputSummary: { changedFiles: 2 },
      completedAt,
    });

    expect(completed).toMatchObject({
      id: run.id,
      automationId: automation.id,
      organizationId: scope.organizationId,
      triggerSource: "scheduled",
      status: "succeeded",
      inputSnapshot: { commit: "abc123" },
      outputSummary: { changedFiles: 2 },
      error: null,
      githubRepositoryAutomationJobId: job.id,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    });

    const [listedRun] = await listWorkspaceAutomationRuns({
      automationId: automation.id,
      organizationId: scope.organizationId,
    });
    expect(listedRun?.id).toBe(run.id);
  });
});
