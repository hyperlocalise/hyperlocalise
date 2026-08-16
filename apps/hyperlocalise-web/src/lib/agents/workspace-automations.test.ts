/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAhrefsConnection } from "@/lib/ahrefs/connections";
import { db, schema } from "@/lib/database";
import { type Result } from "@/lib/primitives/result/results";
import { createSemrushConnection } from "@/lib/semrush/connections";

import { claimGithubRepositoryAutomationJob } from "./github/github-repository-automation-jobs";
import {
  createWorkspaceAutomation,
  createWorkspaceAutomationRun,
  getWorkspaceAutomationById,
  hoistLegacyWorkspaceAutomationProjectId,
  listDueContentfulWorkspaceAutomations,
  listWorkspaceAutomations,
  listWorkspaceAutomationRuns,
  pauseWorkspaceAutomation,
  updateWorkspaceAutomation,
  updateWorkspaceAutomationRun,
  workspaceAutomationConfigSchema,
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

describe("workspaceAutomationConfigSchema web search", () => {
  it("defaults the provider to auto and accepts perplexity or exa", () => {
    expect(
      workspaceAutomationConfigSchema.parse({
        toolConfig: { webSearch: { enabled: true } },
      }).toolConfig.webSearch,
    ).toEqual({ enabled: true, provider: "auto" });

    expect(
      workspaceAutomationConfigSchema.parse({
        toolConfig: { webSearch: { enabled: true, provider: "perplexity" } },
      }).toolConfig.webSearch,
    ).toEqual({ enabled: true, provider: "perplexity" });

    expect(
      workspaceAutomationConfigSchema.parse({
        toolConfig: { webSearch: { enabled: true, provider: "exa" } },
      }).toolConfig.webSearch,
    ).toEqual({ enabled: true, provider: "exa" });
  });
});

describe("workspaceAutomationConfigSchema native TMS tools", () => {
  it("migrates legacy translation toolConfig into create and assign tools", () => {
    const config = workspaceAutomationConfigSchema.parse({
      triggerConfig: { mode: "source_upload" },
      repositoryTarget: { kind: "none" },
      toolConfig: {
        translation: {
          enabled: true,
          useProjectTargetLocales: false,
          targetLocales: ["ja-JP"],
        },
      },
    });

    expect(config.toolConfig).toMatchObject({
      createNativeTmsJob: {
        enabled: true,
        useProjectTargetLocales: false,
        targetLocales: ["ja-JP"],
      },
      assignTranslateWithAgent: {
        enabled: true,
      },
    });
    expect(config.toolConfig).not.toHaveProperty("translation");
  });
});

describe("hoistLegacyWorkspaceAutomationProjectId", () => {
  it("hoists when every legacy tool projectId agrees", () => {
    expect(
      hoistLegacyWorkspaceAutomationProjectId({
        contentful: { projectId: "project-a" },
        translation: { projectId: "project-a" },
        github: { projectId: "project-a" },
      }),
    ).toBe("project-a");
  });

  it("hoists the only non-empty legacy tool projectId", () => {
    expect(
      hoistLegacyWorkspaceAutomationProjectId({
        contentful: { enabled: true },
        github: { projectId: "project-b" },
      }),
    ).toBe("project-b");
  });

  it("refuses to hoist when legacy tool projectIds conflict", () => {
    expect(
      hoistLegacyWorkspaceAutomationProjectId({
        contentful: { projectId: "project-contentful" },
        translation: { projectId: "project-header" },
        github: { projectId: "project-header" },
      }),
    ).toBeNull();
  });
});

describe("workspace automations", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    for (const organizationId of organizationIds.splice(0)) {
      await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    }
  });

  it("does not collapse conflicting legacy tool projectIds onto one automation project", async () => {
    const scope = await seedWorkspaceAutomationScope();
    const otherProjectId = `project-other-${scope.organizationId.slice(0, 8)}`;
    await db.insert(schema.projects).values({
      id: otherProjectId,
      organizationId: scope.organizationId,
      createdByUserId: scope.userId,
      name: "Contentful Project",
    });

    const [row] = await db
      .insert(schema.workspaceAutomations)
      .values({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        status: "active",
        name: "Legacy mismatched projects",
        instructions: "Translate Contentful and sync GitHub.",
        projectId: null,
        triggerConfig: { mode: "manual" },
        repositoryTarget: {
          kind: "github",
          githubInstallationRepositoryId: scope.githubInstallationRepositoryId,
        },
        githubInstallationRepositoryId: scope.githubInstallationRepositoryId,
        toolConfig: {
          contentful: {
            enabled: true,
            connectionId: crypto.randomUUID(),
            projectId: otherProjectId,
            sourceLocale: "en",
            targetLocales: ["fr"],
          },
          github: {
            enabled: true,
            mode: "sync",
            projectId: scope.projectId,
            pushSource: true,
            pullTranslations: false,
            validation: false,
          },
        },
      })
      .returning();

    const automation = await getWorkspaceAutomationById({
      automationId: row!.id,
      organizationId: scope.organizationId,
    });

    // Fail closed: do not prefer Contentful (or any tool) and retarget GitHub.
    expect(automation?.projectId).toBeNull();
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
      projectId: scope.projectId,
      toolConfig: {
        github: {
          enabled: true,
          mode: "sync",
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
          mode: "sync",
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
    expect(missingProject.error.code).toBe("project_required");
  });

  it("rejects scheduled automations without a GitHub or Contentful workflow", async () => {
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
    expect(notificationOnlySchedule.error).toMatchObject({
      code: "scheduled_workflow_required",
      message:
        "Scheduled automations require at least one GitHub, Contentful, Issues, or Web Search workflow tool.",
    });

    const scheduledWebSearch = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Daily web research",
        instructions: "Search the live web for competitor changes.",
        triggerConfig,
        toolConfig: {
          webSearch: { enabled: true, provider: "auto" },
          slack: {
            enabled: true,
            channelId: "C123",
          },
        },
      }),
    );
    expect(scheduledWebSearch.toolConfig.webSearch).toEqual({
      enabled: true,
      provider: "auto",
    });

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
    expect(scheduledUpdate.error).toMatchObject({
      code: "scheduled_workflow_required",
      message:
        "Scheduled automations require at least one GitHub, Contentful, Issues, or Web Search workflow tool.",
    });
  });

  it("rejects scheduled Contentful automations without an entry ID", async () => {
    const scope = await seedWorkspaceAutomationScope();
    const triggerConfig = {
      mode: "scheduled" as const,
      schedule: {
        cadence: "daily" as const,
        hourUtc: 8,
        timezone: "UTC",
      },
    };

    const missingEntryId = await createWorkspaceAutomation({
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Scheduled Contentful automation",
      instructions: "Translate the configured entry on a schedule.",
      projectId: scope.projectId,
      triggerConfig,
      toolConfig: {
        contentful: {
          enabled: true,
          connectionId: crypto.randomUUID(),
          sourceLocale: "en",
          targetLocales: ["fr"],
          contentTypeIds: ["article"],
          fieldMode: "auto",
          overwriteDraftLocales: false,
          runQa: true,
          writeDrafts: true,
        },
      },
    });

    expect(missingEntryId.ok).toBe(false);
    if (missingEntryId.ok) {
      throw new Error("expected validation error");
    }
    expect(missingEntryId.error).toMatchObject({
      code: "contentful_entry_id_required",
      message: "Scheduled Contentful automations require an entry ID.",
    });
  });

  it("lists due Contentful automations before applying the row limit", async () => {
    const scope = await seedWorkspaceAutomationScope();
    const triggerConfig = {
      mode: "scheduled" as const,
      schedule: {
        cadence: "daily" as const,
        hourUtc: 8,
        timezone: "UTC",
      },
    };
    const now = new Date("2099-06-15T12:00:00.000Z");

    expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Due GitHub automation",
        instructions: "Run GitHub automation first.",
        projectId: scope.projectId,
        repositoryTarget: {
          kind: "github",
          githubInstallationRepositoryId: scope.githubInstallationRepositoryId,
        },
        triggerConfig,
        toolConfig: {
          github: {
            enabled: true,
            mode: "sync",
            pushSource: true,
            pullTranslations: false,
            validation: false,
          },
        },
        nextRunAt: new Date("2099-06-15T08:00:00.000Z"),
      }),
    );
    const earlierContentfulAutomation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Earlier due Contentful automation",
        instructions: "Run Contentful automation first.",
        projectId: scope.projectId,
        triggerConfig,
        toolConfig: {
          contentful: {
            enabled: true,
            connectionId: crypto.randomUUID(),
            sourceLocale: "en",
            entryId: "entry-scheduled-1",
            targetLocales: ["fr"],
            contentTypeIds: [],
            fieldMode: "auto",
            overwriteDraftLocales: false,
            runQa: true,
            writeDrafts: true,
          },
        },
        nextRunAt: new Date("2099-06-15T09:00:00.000Z"),
      }),
    );
    const laterContentfulAutomation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Later due Contentful automation",
        instructions: "Run Contentful automation second.",
        projectId: scope.projectId,
        triggerConfig,
        toolConfig: {
          contentful: {
            enabled: true,
            connectionId: crypto.randomUUID(),
            sourceLocale: "en",
            entryId: "entry-scheduled-2",
            targetLocales: ["fr"],
            contentTypeIds: [],
            fieldMode: "auto",
            overwriteDraftLocales: false,
            runQa: true,
            writeDrafts: true,
          },
        },
        nextRunAt: new Date("2099-06-15T10:00:00.000Z"),
      }),
    );

    const dueAutomations = await listDueContentfulWorkspaceAutomations({
      now,
      limit: 1,
      organizationId: scope.organizationId,
    });

    expect(dueAutomations).toHaveLength(1);
    expect(dueAutomations[0]?.id).toBe(earlierContentfulAutomation.id);

    const bothDueAutomations = await listDueContentfulWorkspaceAutomations({
      now,
      limit: 2,
      organizationId: scope.organizationId,
    });

    expect(bothDueAutomations.map((automation) => automation.id)).toEqual([
      earlierContentfulAutomation.id,
      laterContentfulAutomation.id,
    ]);
  });

  it("only versions config-changing automation updates", async () => {
    const scope = await seedWorkspaceAutomationScope();
    const automation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Repository automation",
        instructions: "Run repository automation.",
        projectId: scope.projectId,
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
            mode: "sync",
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

  it("rejects Slack, email, and MCP tools when integrations are missing or disabled", async () => {
    const scope = await seedWorkspaceAutomationScope();
    const base = {
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "Integration gated automation",
      instructions: "Notify operators.",
      projectId: scope.projectId,
      triggerConfig: { mode: "manual" as const },
      repositoryTarget: { kind: "none" as const },
    };

    const slackMissing = await createWorkspaceAutomation({
      ...base,
      toolConfig: {
        slack: { enabled: true, channelId: "C123" },
      },
    });
    expect(slackMissing.ok).toBe(false);
    if (slackMissing.ok) {
      throw new Error("expected slack validation error");
    }
    expect(slackMissing.error.code).toBe("slack_not_connected");

    await db.insert(schema.connectors).values({
      organizationId: scope.organizationId,
      kind: "email",
      enabled: false,
    });
    const emailDisabled = await createWorkspaceAutomation({
      ...base,
      toolConfig: {
        email: { enabled: true, recipients: ["ops@example.test"] },
      },
    });
    expect(emailDisabled.ok).toBe(false);
    if (emailDisabled.ok) {
      throw new Error("expected email validation error");
    }
    expect(emailDisabled.error.code).toBe("email_not_connected");

    const mcpMissing = await createWorkspaceAutomation({
      ...base,
      toolConfig: {
        mcp: {
          enabled: true,
          connectionId: "11111111-1111-4111-8111-111111111111",
        },
      },
    });
    expect(mcpMissing.ok).toBe(false);
    if (mcpMissing.ok) {
      throw new Error("expected mcp not-found validation error");
    }
    expect(mcpMissing.error.code).toBe("mcp_connection_not_found");

    const [mcpConnection] = await db
      .insert(schema.mcpServerConnections)
      .values({
        organizationId: scope.organizationId,
        createdByUserId: scope.userId,
        displayName: "Disabled MCP",
        serverUrl: "https://mcp.example.test/mcp",
        transport: "http",
        authKind: "none",
        enabled: false,
        encryptionAlgorithm: "aes-256-gcm",
        ciphertext: "ciphertext",
        iv: "iv",
        authTag: "tag",
        maskedTokenSuffix: "none",
      })
      .returning();
    if (!mcpConnection) {
      throw new Error("failed to seed mcp connection");
    }

    const mcpDisabled = await createWorkspaceAutomation({
      ...base,
      toolConfig: {
        mcp: {
          enabled: true,
          connectionId: mcpConnection.id,
        },
      },
    });
    expect(mcpDisabled.ok).toBe(false);
    if (mcpDisabled.ok) {
      throw new Error("expected mcp disabled validation error");
    }
    expect(mcpDisabled.error.code).toBe("mcp_not_connected");
  });

  it("rejects Semrush and Ahrefs tools when connections are missing, disabled, or unvalidated", async () => {
    const scope = await seedWorkspaceAutomationScope();
    const base = {
      organizationId: scope.organizationId,
      authorUserId: scope.userId,
      name: "SEO gated automation",
      instructions: "Query SEO tools.",
      projectId: scope.projectId,
      triggerConfig: { mode: "manual" as const },
      repositoryTarget: { kind: "none" as const },
    };

    const semrushMissingId = await createWorkspaceAutomation({
      ...base,
      toolConfig: {
        semrush: { enabled: true },
      },
    });
    expect(semrushMissingId.ok).toBe(false);
    if (semrushMissingId.ok) {
      throw new Error("expected semrush connection required error");
    }
    expect(semrushMissingId.error.code).toBe("semrush_connection_required");

    const ahrefsMissingId = await createWorkspaceAutomation({
      ...base,
      toolConfig: {
        ahrefs: { enabled: true },
      },
    });
    expect(ahrefsMissingId.ok).toBe(false);
    if (ahrefsMissingId.ok) {
      throw new Error("expected ahrefs connection required error");
    }
    expect(ahrefsMissingId.error.code).toBe("ahrefs_connection_required");

    const semrushMissing = await createWorkspaceAutomation({
      ...base,
      toolConfig: {
        semrush: {
          enabled: true,
          connectionId: "11111111-1111-4111-8111-111111111111",
        },
      },
    });
    expect(semrushMissing.ok).toBe(false);
    if (semrushMissing.ok) {
      throw new Error("expected semrush not-found validation error");
    }
    expect(semrushMissing.error.code).toBe("semrush_connection_not_found");

    const ahrefsMissing = await createWorkspaceAutomation({
      ...base,
      toolConfig: {
        ahrefs: {
          enabled: true,
          connectionId: "22222222-2222-4222-8222-222222222222",
        },
      },
    });
    expect(ahrefsMissing.ok).toBe(false);
    if (ahrefsMissing.ok) {
      throw new Error("expected ahrefs not-found validation error");
    }
    expect(ahrefsMissing.error.code).toBe("ahrefs_connection_not_found");

    const semrushUnvalidated = expectOk(
      await createSemrushConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        displayName: "Unvalidated Semrush",
        apiKey: "semrush_test_api_key_unvalidated",
        validate: false,
      }),
    );
    const semrushNotValid = await createWorkspaceAutomation({
      ...base,
      toolConfig: {
        semrush: {
          enabled: true,
          connectionId: semrushUnvalidated.id,
        },
      },
    });
    expect(semrushNotValid.ok).toBe(false);
    if (semrushNotValid.ok) {
      throw new Error("expected semrush unvalidated validation error");
    }
    expect(semrushNotValid.error.code).toBe("semrush_not_connected");

    const ahrefsDisabled = expectOk(
      await createAhrefsConnection({
        organizationId: scope.organizationId,
        userId: scope.userId,
        displayName: "Disabled Ahrefs",
        apiKey: "ahrefs_test_api_key_disabled",
        enabled: false,
        validate: false,
      }),
    );
    await db
      .update(schema.ahrefsConnections)
      .set({ validationStatus: "valid", validationMessage: "test" })
      .where(eq(schema.ahrefsConnections.id, ahrefsDisabled.id));

    const ahrefsNotEnabled = await createWorkspaceAutomation({
      ...base,
      toolConfig: {
        ahrefs: {
          enabled: true,
          connectionId: ahrefsDisabled.id,
        },
      },
    });
    expect(ahrefsNotEnabled.ok).toBe(false);
    if (ahrefsNotEnabled.ok) {
      throw new Error("expected ahrefs disabled validation error");
    }
    expect(ahrefsNotEnabled.error.code).toBe("ahrefs_not_connected");

    const updateRejected = await updateWorkspaceAutomation({
      automationId: expectOk(
        await createWorkspaceAutomation({
          ...base,
          name: "Baseline automation",
          toolConfig: {},
        }),
      ).id,
      organizationId: scope.organizationId,
      toolConfig: {
        semrush: {
          enabled: true,
          connectionId: semrushUnvalidated.id,
        },
      },
    });
    expect(updateRejected.ok).toBe(false);
    if (updateRejected.ok) {
      throw new Error("expected update-path semrush validation error");
    }
    expect(updateRejected.error.code).toBe("semrush_not_connected");
  });

  it("hoists legacy nested project IDs from tool config", () => {
    expect(
      hoistLegacyWorkspaceAutomationProjectId({
        github: { projectId: " github-project " },
      }),
    ).toBe("github-project");
    expect(
      hoistLegacyWorkspaceAutomationProjectId({
        contentful: { projectId: "shared-project" },
        translation: { projectId: "shared-project" },
        github: { projectId: "shared-project" },
      }),
    ).toBe("shared-project");
    // Fail closed: do not prefer Contentful/translation when legacy IDs disagree.
    expect(
      hoistLegacyWorkspaceAutomationProjectId({
        contentful: { projectId: "contentful-project" },
        translation: { projectId: "translation-project" },
        github: { projectId: "github-project" },
      }),
    ).toBeNull();
    expect(
      hoistLegacyWorkspaceAutomationProjectId({
        translation: { projectId: "translation-project" },
        github: { projectId: "github-project" },
      }),
    ).toBeNull();
    expect(hoistLegacyWorkspaceAutomationProjectId({ github: { projectId: "   " } })).toBeNull();
    expect(hoistLegacyWorkspaceAutomationProjectId({})).toBeNull();
  });
});
