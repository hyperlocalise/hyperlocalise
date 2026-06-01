import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";
import { type Result } from "@/lib/primitives/result/results";

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

function expectOk<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error("expected ok result");
  }
  return result.value;
}

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

    const automation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Refresh repository translations",
        instructions: "Pull the latest source strings and prepare translation updates.",
        nextRunAt,
      }),
    );

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

    const missingRepositoryTarget = await createWorkspaceAutomation({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Broken GitHub automation",
      instructions: "Run GitHub automation.",
      toolConfig: {
        github: {
          enabled: true,
          pushSource: true,
          pullTranslations: false,
          validation: false,
        },
      },
    });
    expect(missingRepositoryTarget.ok).toBe(false);
    if (missingRepositoryTarget.ok) {
      throw new Error("expected validation error");
    }
    expect(missingRepositoryTarget.error.code).toBe("github_repository_target_required");

    const missingProject = await createWorkspaceAutomation({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Broken GitHub automation",
      instructions: "Run GitHub automation.",
      repositoryTarget: {
        kind: "github",
        githubInstallationRepositoryId: scope.githubInstallationRepositoryId,
      },
      toolConfig: {
        github: {
          enabled: true,
          pushSource: true,
          pullTranslations: false,
          validation: false,
        },
      },
    });
    expect(missingProject.ok).toBe(false);
    if (missingProject.ok) {
      throw new Error("expected validation error");
    }
    expect(missingProject.error.code).toBe("github_project_required");
  });

  it("rejects scheduled automations without a GitHub workflow", async () => {
    const scope = await seedWorkspaceAutomationScope();
    const triggerConfig = {
      mode: "scheduled" as const,
      schedule: {
        cadence: "daily" as const,
        hourUtc: 8,
        timezone: "UTC",
      },
    };

    await db.insert(schema.connectors).values({
      organizationId: scope.organizationId,
      kind: "slack",
      enabled: true,
    });

    const notificationOnlySchedule = await createWorkspaceAutomation({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Notification-only schedule",
      instructions: "Send a daily reminder.",
      triggerConfig,
      toolConfig: {
        slack: {
          enabled: true,
          channelId: "C123",
        },
      },
    });
    expect(notificationOnlySchedule.ok).toBe(false);
    if (notificationOnlySchedule.ok) {
      throw new Error("expected validation error");
    }
    expect(notificationOnlySchedule.error.code).toBe("scheduled_github_workflow_required");

    const manualNotification = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Manual notification",
        instructions: "Send a reminder manually.",
        toolConfig: {
          slack: {
            enabled: true,
            channelId: "C123",
          },
        },
      }),
    );
    const scheduledUpdate = await updateWorkspaceAutomation({
      automationId: manualNotification.id,
      organizationId: scope.organizationId,
      triggerConfig,
    });
    expect(scheduledUpdate.ok).toBe(false);
    if (scheduledUpdate.ok) {
      throw new Error("expected validation error");
    }
    expect(scheduledUpdate.error.code).toBe("scheduled_github_workflow_required");
  });

  it("only versions config-changing automation updates", async () => {
    const scope = await seedWorkspaceAutomationScope();
    const automation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Repository automation",
        instructions: "Run repository automation.",
        repositoryTarget: {
          kind: "github",
          githubInstallationRepositoryId: scope.githubInstallationRepositoryId,
        },
        triggerConfig: {
          mode: "scheduled",
          schedule: {
            cadence: "daily",
            hourUtc: 12,
            timezone: "UTC",
          },
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
      }),
    );

    const updated = expectOk(
      await updateWorkspaceAutomation({
        automationId: automation.id,
        organizationId: scope.organizationId,
        name: "Updated repository automation",
        nextRunAt: new Date("2026-06-02T12:00:00.000Z"),
      }),
    );
    const configUpdated = expectOk(
      await updateWorkspaceAutomation({
        automationId: automation.id,
        organizationId: scope.organizationId,
        instructions: "Run repository automation with updated guidance.",
      }),
    );
    const paused = expectOk(
      await pauseWorkspaceAutomation({
        automationId: automation.id,
        organizationId: scope.organizationId,
      }),
    );

    expect(updated?.configVersion).toBe(1);
    expect(updated?.name).toBe("Updated repository automation");
    expect(configUpdated?.configVersion).toBe(2);
    expect(configUpdated?.instructions).toBe("Run repository automation with updated guidance.");
    expect(paused?.status).toBe("paused");
    expect(paused?.configVersion).toBe(2);
    expect(paused?.nextRunAt).toBeNull();
  });

  it("does not pause archived automations", async () => {
    const scope = await seedWorkspaceAutomationScope();
    const archived = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        status: "archived",
        name: "Archived automation",
        instructions: "Do not run this automation.",
        nextRunAt: new Date("2026-06-01T12:00:00.000Z"),
      }),
    );

    const paused = expectOk(
      await pauseWorkspaceAutomation({
        automationId: archived.id,
        organizationId: scope.organizationId,
      }),
    );

    expect(paused?.status).toBe("archived");
    expect(paused?.nextRunAt).toBe("2026-06-01T12:00:00.000Z");
  });

  it("paginates workspace automation lists with offset", async () => {
    const scope = await seedWorkspaceAutomationScope();
    const automations = (
      await Promise.all(
        [1, 2, 3].map((index) =>
          createWorkspaceAutomation({
            organizationId: scope.organizationId,
            authorUserId: scope.userId,
            name: `Automation ${index}`,
            instructions: `Run automation ${index}.`,
          }),
        ),
      )
    ).map(expectOk);

    for (const [index, automation] of automations.entries()) {
      await db
        .update(schema.workspaceAutomations)
        .set({ createdAt: new Date(`2026-06-0${index + 1}T12:00:00.000Z`) })
        .where(eq(schema.workspaceAutomations.id, automation.id));
    }

    const firstPage = await listWorkspaceAutomations({
      organizationId: scope.organizationId,
      limit: 2,
    });
    const secondPage = await listWorkspaceAutomations({
      organizationId: scope.organizationId,
      limit: 2,
      offset: 2,
    });

    expect(firstPage.map((item) => item.name)).toEqual(["Automation 3", "Automation 2"]);
    expect(secondPage.map((item) => item.name)).toEqual(["Automation 1"]);
  });

  it("creates and serializes run history with optional GitHub job links", async () => {
    const scope = await seedWorkspaceAutomationScope();
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

  it("rejects run creation when automation belongs to another organization", async () => {
    const ownerScope = await seedWorkspaceAutomationScope();
    const callerScope = await seedWorkspaceAutomationScope();
    const automation = expectOk(
      await createWorkspaceAutomation({
        organizationId: ownerScope.organizationId,
        authorUserId: ownerScope.userId,
        name: "Owner automation",
        instructions: "Run only for the owning organization.",
      }),
    );

    await expect(
      createWorkspaceAutomationRun({
        automationId: automation.id,
        organizationId: callerScope.organizationId,
        triggerSource: "manual",
      }),
    ).rejects.toThrow("workspace_automation_not_found");
  });

  it("rejects duplicate GitHub job links across automation runs", async () => {
    const scope = await seedWorkspaceAutomationScope();
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
      githubRepositoryAutomationJobId: job.id,
    });

    await expect(
      createWorkspaceAutomationRun({
        automationId: automation.id,
        organizationId: scope.organizationId,
        triggerSource: "scheduled",
        githubRepositoryAutomationJobId: job.id,
      }),
    ).rejects.toThrow();
  });

  it("paginates workspace automation runs with offset", async () => {
    const scope = await seedWorkspaceAutomationScope();
    const automation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Repository automation",
        instructions: "Run repository automation.",
      }),
    );
    const runs = await Promise.all(
      [1, 2, 3].map((index) =>
        createWorkspaceAutomationRun({
          automationId: automation.id,
          organizationId: scope.organizationId,
          triggerSource: "manual",
          inputSnapshot: { index },
        }),
      ),
    );

    for (const [index, run] of runs.entries()) {
      await db
        .update(schema.workspaceAutomationRuns)
        .set({ createdAt: new Date(`2026-06-0${index + 1}T12:00:00.000Z`) })
        .where(eq(schema.workspaceAutomationRuns.id, run.id));
    }

    const firstPage = await listWorkspaceAutomationRuns({
      automationId: automation.id,
      organizationId: scope.organizationId,
      limit: 2,
    });
    const secondPage = await listWorkspaceAutomationRuns({
      automationId: automation.id,
      organizationId: scope.organizationId,
      limit: 2,
      offset: 2,
    });

    expect(firstPage.map((item) => item.inputSnapshot)).toEqual([{ index: 3 }, { index: 2 }]);
    expect(secondPage.map((item) => item.inputSnapshot)).toEqual([{ index: 1 }]);
  });
});
