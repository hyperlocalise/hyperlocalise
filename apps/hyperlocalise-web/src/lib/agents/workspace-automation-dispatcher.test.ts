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

import { db, schema } from "@/lib/database";
import { type Result } from "@/lib/primitives/result/results";

import { createContentfulConnection } from "@/lib/contentful/connections";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";

import {
  createWorkspaceAutomation,
  listWorkspaceAutomationRuns,
  updateWorkspaceAutomationRun,
} from "./workspace-automations";

function expectOk<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error("expected ok result");
  }
  return result.value;
}
import {
  dispatchContentfulWorkspaceAutomationForManual,
  dispatchContentfulWorkspaceAutomationForSchedule,
  dispatchManualWorkspaceAutomationRun,
  dispatchWorkspaceAutomationForSchedule,
  dispatchWorkspaceAutomationsForContentfulWebhook,
  dispatchWorkspaceAutomationsForGithubPullRequest,
  dispatchWorkspaceAutomationsForGithubPush,
  dispatchWorkspaceAutomationsForSourceUpload,
} from "./workspace-automation-dispatcher";
import {
  buildWorkspaceGithubPushAutomationIdempotencyKey,
  buildWorkspaceSourceUploadAutomationIdempotencyKey,
} from "./workspace-automation-idempotency";

const organizationIds: string[] = [];

async function seedDispatchScope() {
  const organizationId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const numericSuffix = BigInt(`0x${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`)
    .toString()
    .slice(0, 12);

  organizationIds.push(organizationId);

  await db.insert(schema.organizations).values({
    id: organizationId,
    workosOrganizationId: `org_${organizationId}`,
    slug: `workspace-dispatch-${organizationId.slice(0, 8)}`,
    name: "Workspace Dispatch Test Org",
  });

  await db.insert(schema.users).values({
    id: userId,
    workosUserId: `user_${userId}`,
    email: `${userId}@example.test`,
  });

  const projectId = `project-${organizationId.slice(0, 8)}`;
  await db.insert(schema.projects).values({
    id: projectId,
    identifier: uniqueTestProjectIdentifier(),
    organizationId,
    createdByUserId: userId,
    name: "Website",
  });

  const githubInstallationId = `7${numericSuffix}`;
  const githubRepositoryId = `6${numericSuffix}`;

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
    throw new Error("failed to seed repository");
  }

  return {
    organizationId,
    userId,
    projectId,
    repository,
    githubInstallationId,
    githubRepositoryId,
  };
}

async function seedSourceUploadAutomation(input: {
  organizationId: string;
  userId: string;
  projectId: string;
  name: string;
}) {
  return expectOk(
    await createWorkspaceAutomation({
      organizationId: input.organizationId,
      authorUserId: input.userId,
      name: input.name,
      instructions: "Translate each changed source file once.",
      projectId: input.projectId,
      triggerConfig: { mode: "source_upload" },
      repositoryTarget: { kind: "none" },
      toolConfig: {
        createNativeTmsJob: {
          enabled: true,
          useProjectTargetLocales: true,
          targetLocales: [],
        },
        assignTranslateWithAgent: {
          enabled: true,
        },
      },
    }),
  );
}

describe("workspace automation dispatcher", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    for (const organizationId of organizationIds.splice(0)) {
      await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    }
  });

  it("creates idempotent scheduled runs linked to github jobs", async () => {
    const scope = await seedDispatchScope();
    const scheduledRunAt = new Date("2026-06-01T08:00:00.000Z");
    const automation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Scheduled validation",
        instructions: "Run validation on a schedule.",
        projectId: scope.projectId,
        triggerConfig: {
          mode: "scheduled",
          schedule: {
            cadence: "daily",
            hourUtc: 8,
            timezone: "UTC",
          },
        },
        repositoryTarget: {
          kind: "github",
          githubInstallationRepositoryId: scope.repository.id,
        },
        toolConfig: {
          github: {
            enabled: true,
            mode: "sync",
            pushSource: false,
            pullTranslations: false,
            validation: true,
          },
        },
        nextRunAt: scheduledRunAt,
      }),
    );

    const enqueued: Array<{ workspaceAutomationRunId: string; organizationId: string }> = [];
    const queue = {
      async enqueue(event: { workspaceAutomationRunId: string; organizationId: string }) {
        enqueued.push(event);
        return { ids: ["workflow-1"] };
      },
    };

    const first = await dispatchWorkspaceAutomationForSchedule({
      automation,
      scheduledRunAt,
      queue,
    });
    const second = await dispatchWorkspaceAutomationForSchedule({
      automation,
      scheduledRunAt,
      queue,
    });

    expect(first?.outcome).toBe("enqueued");
    expect(second?.outcome).toBe("enqueued");
    expect(second?.inserted).toBe(false);
    expect(enqueued).toHaveLength(1);

    const runs = await listWorkspaceAutomationRuns({
      automationId: automation.id,
      organizationId: scope.organizationId,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.outputSummary.orchestratorEnqueuedAt).toBeTruthy();
  });

  it("queues on-demand runs for scheduled automations", async () => {
    const scope = await seedDispatchScope();
    const automation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Scheduled validation",
        instructions: "Run validation on a schedule.",
        projectId: scope.projectId,
        triggerConfig: {
          mode: "scheduled",
          schedule: {
            cadence: "daily",
            hourUtc: 8,
            timezone: "UTC",
          },
        },
        repositoryTarget: {
          kind: "github",
          githubInstallationRepositoryId: scope.repository.id,
        },
        toolConfig: {
          github: {
            enabled: true,
            mode: "sync",
            pushSource: false,
            pullTranslations: false,
            validation: true,
          },
        },
      }),
    );

    const enqueued: Array<{ workspaceAutomationRunId: string; organizationId: string }> = [];
    const result = await dispatchManualWorkspaceAutomationRun({
      automation,
      idempotencyKey: `manual:${automation.id}:operator-run`,
      queue: {
        async enqueue(event: { workspaceAutomationRunId: string; organizationId: string }) {
          enqueued.push(event);
          return { ids: ["workflow-1"] };
        },
      },
    });

    expect(result).toMatchObject({ outcome: "enqueued", inserted: true });
    expect(enqueued).toHaveLength(1);

    const runs = await listWorkspaceAutomationRuns({
      automationId: automation.id,
      organizationId: scope.organizationId,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      triggerSource: "manual",
      status: "queued",
    });
  });

  it("does not queue on-demand runs for GitHub push automations", async () => {
    const scope = await seedDispatchScope();
    const automation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Push validation",
        instructions: "Run validation on GitHub push.",
        projectId: scope.projectId,
        triggerConfig: {
          mode: "github",
          branches: ["main"],
        },
        repositoryTarget: {
          kind: "github",
          githubInstallationRepositoryId: scope.repository.id,
        },
        toolConfig: {
          github: {
            enabled: true,
            mode: "sync",
            pushSource: false,
            pullTranslations: false,
            validation: true,
          },
        },
      }),
    );

    const result = await dispatchManualWorkspaceAutomationRun({
      automation,
      idempotencyKey: `manual:${automation.id}:push-run`,
    });

    expect(result).toBeNull();
    const runs = await listWorkspaceAutomationRuns({
      automationId: automation.id,
      organizationId: scope.organizationId,
    });
    expect(runs).toHaveLength(0);
  });

  it("dispatches Contentful webhook automation idempotently", async () => {
    const scope = await seedDispatchScope();
    const contentfulConnection = await createContentfulConnection({
      organizationId: scope.organizationId,
      userId: scope.userId,
      projectId: scope.projectId,
      displayName: "Contentful Help Center",
      spaceId: `space-${scope.organizationId.slice(0, 8)}`,
      environmentId: "master",
      contentTypeIds: ["helpCenterArticle"],
      fieldConfig: { fieldMode: "auto" },
      accessToken: "cma_test_token",
    });
    const [subscription] = await db
      .select()
      .from(schema.contentfulWebhookSubscriptions)
      .where(
        eq(schema.contentfulWebhookSubscriptions.connectionId, contentfulConnection.connection.id),
      )
      .limit(1);
    if (!subscription) {
      throw new Error("failed to seed contentful webhook subscription");
    }

    const [webhookEvent] = await db
      .insert(schema.contentfulWebhookEvents)
      .values({
        organizationId: scope.organizationId,
        connectionId: contentfulConnection.connection.id,
        subscriptionId: subscription.id,
        eventType: "ContentManagement.Entry.publish",
        dedupeKey: "delivery-1",
        providerEventId: "delivery-1",
        entryId: "entry-1",
        contentTypeId: "helpCenterArticle",
      })
      .returning();
    if (!webhookEvent) {
      throw new Error("failed to seed contentful webhook event");
    }

    const automation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Translate Contentful article",
        instructions: "Translate Contentful updates.",
        projectId: scope.projectId,
        triggerConfig: { mode: "contentful" },
        repositoryTarget: { kind: "none" },
        toolConfig: {
          contentful: {
            enabled: true,
            connectionId: contentfulConnection.connection.id,
            sourceLocale: "de-DE",
            targetLocales: ["fr-FR"],
            contentTypeIds: ["helpCenterArticle"],
            fieldMode: "auto",
            overwriteDraftLocales: false,
            runQa: true,
            writeDrafts: true,
          },
        },
      }),
    );
    for (let index = 0; index < 100; index += 1) {
      expectOk(
        await createWorkspaceAutomation({
          organizationId: scope.organizationId,
          authorUserId: scope.userId,
          name: `Newer GitHub automation ${index}`,
          instructions: "Run validation on pushes.",
          projectId: scope.projectId,
          triggerConfig: { mode: "github", branches: ["main"] },
          repositoryTarget: {
            kind: "github",
            githubInstallationRepositoryId: scope.repository.id,
          },
          toolConfig: {
            github: {
              enabled: true,
              mode: "sync",
              pushSource: false,
              pullTranslations: false,
              validation: true,
            },
          },
        }),
      );
    }
    const enqueued: Array<{ workspaceAutomationRunId: string; organizationId: string }> = [];
    const queue = {
      async enqueue(event: { workspaceAutomationRunId: string; organizationId: string }) {
        enqueued.push(event);
        return { ids: ["workflow-1"] };
      },
    };

    const first = await dispatchWorkspaceAutomationsForContentfulWebhook({
      organizationId: scope.organizationId,
      connectionId: contentfulConnection.connection.id,
      contentfulWebhookEventId: webhookEvent.id,
      entryId: "entry-1",
      contentTypeId: "helpCenterArticle",
      queue,
    });
    const second = await dispatchWorkspaceAutomationsForContentfulWebhook({
      organizationId: scope.organizationId,
      connectionId: contentfulConnection.connection.id,
      contentfulWebhookEventId: webhookEvent.id,
      entryId: "entry-1",
      contentTypeId: "helpCenterArticle",
      queue,
    });

    expect(first[0]?.outcome).toBe("enqueued");
    expect(first[0]?.inserted).toBe(true);
    expect(second[0]?.outcome).toBe("enqueued");
    expect(second[0]?.inserted).toBe(false);
    expect(enqueued).toHaveLength(1);

    const runs = await listWorkspaceAutomationRuns({
      automationId: automation.id,
      organizationId: scope.organizationId,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.outputSummary.orchestratorEnqueuedAt).toBeTruthy();
  });

  it("creates skipped scheduled Contentful runs when project or source locale is missing", async () => {
    const scope = await seedDispatchScope();
    const contentfulConnection = await createContentfulConnection({
      organizationId: scope.organizationId,
      userId: scope.userId,
      projectId: scope.projectId,
      displayName: "Contentful Help Center",
      spaceId: `space-${scope.organizationId.slice(0, 8)}`,
      environmentId: "master",
      contentTypeIds: ["helpCenterArticle"],
      fieldConfig: { fieldMode: "auto" },
      accessToken: "cma_test_token",
    });
    const scheduledRunAt = new Date("2026-06-01T08:00:00.000Z");
    const baseToolConfig = {
      enabled: true,
      connectionId: contentfulConnection.connection.id,
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      contentTypeIds: ["helpCenterArticle"],
      fieldMode: "auto" as const,
      overwriteDraftLocales: false,
      runQa: true,
      writeDrafts: true,
      entryId: "entry-1",
    };

    const missingProjectAutomation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Scheduled Contentful without project",
        instructions: "Translate on schedule.",
        projectId: scope.projectId,
        triggerConfig: {
          mode: "scheduled",
          schedule: {
            cadence: "daily",
            hourUtc: 8,
            timezone: "UTC",
          },
        },
        repositoryTarget: { kind: "none" },
        toolConfig: { contentful: baseToolConfig },
        nextRunAt: scheduledRunAt,
      }),
    );
    const missingProjectAutomationRecord = {
      ...missingProjectAutomation,
      projectId: null,
    };

    const missingProjectResult = await dispatchContentfulWorkspaceAutomationForSchedule({
      automation: missingProjectAutomationRecord,
      scheduledRunAt,
    });

    expect(missingProjectResult?.outcome).toBe("skipped");
    if (missingProjectResult?.outcome === "skipped") {
      expect(missingProjectResult.skipReason).toBe("contentful_project_missing");
    }

    const missingProjectRuns = await listWorkspaceAutomationRuns({
      automationId: missingProjectAutomation.id,
      organizationId: scope.organizationId,
    });
    expect(missingProjectRuns).toHaveLength(1);
    expect(missingProjectRuns[0]?.status).toBe("skipped");
    expect(missingProjectRuns[0]?.outputSummary).toEqual({
      skipReason: "contentful_project_missing",
    });

    const missingLocaleAutomation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Scheduled Contentful without source locale",
        instructions: "Translate on schedule.",
        projectId: scope.projectId,
        triggerConfig: {
          mode: "scheduled",
          schedule: {
            cadence: "daily",
            hourUtc: 8,
            timezone: "UTC",
          },
        },
        repositoryTarget: { kind: "none" },
        toolConfig: { contentful: baseToolConfig },
        nextRunAt: scheduledRunAt,
      }),
    );
    const missingLocaleAutomationRecord = {
      ...missingLocaleAutomation,
      toolConfig: {
        contentful: {
          ...baseToolConfig,
          sourceLocale: "",
        },
      },
    };

    const missingLocaleResult = await dispatchContentfulWorkspaceAutomationForSchedule({
      automation: missingLocaleAutomationRecord,
      scheduledRunAt,
    });

    expect(missingLocaleResult?.outcome).toBe("skipped");
    if (missingLocaleResult?.outcome === "skipped") {
      expect(missingLocaleResult.skipReason).toBe("contentful_source_locale_missing");
    }

    const missingLocaleRuns = await listWorkspaceAutomationRuns({
      automationId: missingLocaleAutomation.id,
      organizationId: scope.organizationId,
    });
    expect(missingLocaleRuns).toHaveLength(1);
    expect(missingLocaleRuns[0]?.status).toBe("skipped");
    expect(missingLocaleRuns[0]?.outputSummary).toEqual({
      skipReason: "contentful_source_locale_missing",
    });

    const missingTargetLocalesAutomation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Scheduled Contentful without target locales",
        instructions: "Translate on schedule.",
        projectId: scope.projectId,
        triggerConfig: {
          mode: "scheduled",
          schedule: {
            cadence: "daily",
            hourUtc: 8,
            timezone: "UTC",
          },
        },
        repositoryTarget: { kind: "none" },
        toolConfig: { contentful: baseToolConfig },
        nextRunAt: scheduledRunAt,
      }),
    );
    const missingTargetLocalesAutomationRecord = {
      ...missingTargetLocalesAutomation,
      toolConfig: {
        contentful: {
          ...baseToolConfig,
          targetLocales: [],
        },
      },
    };

    const missingTargetLocalesResult = await dispatchContentfulWorkspaceAutomationForSchedule({
      automation: missingTargetLocalesAutomationRecord,
      scheduledRunAt,
    });

    expect(missingTargetLocalesResult?.outcome).toBe("skipped");
    if (missingTargetLocalesResult?.outcome === "skipped") {
      expect(missingTargetLocalesResult.skipReason).toBe("contentful_target_locales_missing");
    }

    const missingTargetLocalesRuns = await listWorkspaceAutomationRuns({
      automationId: missingTargetLocalesAutomation.id,
      organizationId: scope.organizationId,
    });
    expect(missingTargetLocalesRuns).toHaveLength(1);
    expect(missingTargetLocalesRuns[0]?.status).toBe("skipped");
    expect(missingTargetLocalesRuns[0]?.outputSummary).toEqual({
      skipReason: "contentful_target_locales_missing",
    });
  });

  it("does not manually dispatch non-manual Contentful automations", async () => {
    const scope = await seedDispatchScope();
    const contentfulConnection = await createContentfulConnection({
      organizationId: scope.organizationId,
      userId: scope.userId,
      projectId: scope.projectId,
      displayName: "Contentful Help Center",
      spaceId: `space-${scope.organizationId.slice(0, 8)}`,
      environmentId: "master",
      contentTypeIds: ["helpCenterArticle"],
      fieldConfig: { fieldMode: "auto" },
      accessToken: "cma_test_token",
    });
    const automation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Contentful webhook translation",
        instructions: "Translate Contentful entries from webhooks.",
        projectId: scope.projectId,
        triggerConfig: { mode: "contentful" },
        repositoryTarget: { kind: "none" },
        toolConfig: {
          contentful: {
            enabled: true,
            connectionId: contentfulConnection.connection.id,
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
            contentTypeIds: ["helpCenterArticle"],
            fieldMode: "auto",
            overwriteDraftLocales: false,
            runQa: true,
            writeDrafts: true,
          },
        },
      }),
    );
    const enqueued: unknown[] = [];

    const result = await dispatchContentfulWorkspaceAutomationForManual({
      automation,
      idempotencyKey: "manual-non-manual-contentful",
      queue: {
        async enqueue(event: { workspaceAutomationRunId: string; organizationId: string }) {
          enqueued.push(event);
          return { ids: ["workflow-1"] };
        },
      },
    });

    expect(result).toBeNull();
    expect(enqueued).toHaveLength(0);
    const runs = await listWorkspaceAutomationRuns({
      automationId: automation.id,
      organizationId: scope.organizationId,
    });
    expect(runs).toHaveLength(0);
  });

  it("dispatches Contentful webhook automations only for matching content types", async () => {
    const scope = await seedDispatchScope();
    const contentfulConnection = await createContentfulConnection({
      organizationId: scope.organizationId,
      userId: scope.userId,
      projectId: scope.projectId,
      displayName: "Contentful Help Center",
      spaceId: `space-${scope.organizationId.slice(0, 8)}`,
      environmentId: "master",
      contentTypeIds: ["article", "blogPost"],
      fieldConfig: { fieldMode: "auto" },
      accessToken: "cma_test_token",
    });
    const [subscription] = await db
      .select()
      .from(schema.contentfulWebhookSubscriptions)
      .where(
        eq(schema.contentfulWebhookSubscriptions.connectionId, contentfulConnection.connection.id),
      )
      .limit(1);
    if (!subscription) {
      throw new Error("failed to seed contentful webhook subscription");
    }

    const [webhookEvent] = await db
      .insert(schema.contentfulWebhookEvents)
      .values({
        organizationId: scope.organizationId,
        connectionId: contentfulConnection.connection.id,
        subscriptionId: subscription.id,
        eventType: "ContentManagement.Entry.publish",
        dedupeKey: "delivery-blog-post",
        providerEventId: "delivery-blog-post",
        entryId: "entry-blog-post",
        contentTypeId: "blogPost",
      })
      .returning();
    if (!webhookEvent) {
      throw new Error("failed to seed contentful webhook event");
    }

    const articleAutomation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Translate article entries",
        instructions: "Translate article updates.",
        projectId: scope.projectId,
        triggerConfig: { mode: "contentful" },
        repositoryTarget: { kind: "none" },
        toolConfig: {
          contentful: {
            enabled: true,
            connectionId: contentfulConnection.connection.id,
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
            contentTypeIds: ["article"],
            fieldMode: "auto",
            overwriteDraftLocales: false,
            runQa: true,
            writeDrafts: true,
          },
        },
      }),
    );
    const blogPostAutomation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Translate blog post entries",
        instructions: "Translate blog post updates.",
        projectId: scope.projectId,
        triggerConfig: { mode: "contentful" },
        repositoryTarget: { kind: "none" },
        toolConfig: {
          contentful: {
            enabled: true,
            connectionId: contentfulConnection.connection.id,
            sourceLocale: "en-US",
            targetLocales: ["fr-FR"],
            contentTypeIds: ["blogPost"],
            fieldMode: "auto",
            overwriteDraftLocales: false,
            runQa: true,
            writeDrafts: true,
          },
        },
      }),
    );

    const enqueuedAutomationIds: string[] = [];
    const queue = {
      async enqueue(event: { workspaceAutomationRunId: string; organizationId: string }) {
        const [run] = await db
          .select({ automationId: schema.workspaceAutomationRuns.automationId })
          .from(schema.workspaceAutomationRuns)
          .where(eq(schema.workspaceAutomationRuns.id, event.workspaceAutomationRunId))
          .limit(1);
        if (run?.automationId) {
          enqueuedAutomationIds.push(run.automationId);
        }
        return { ids: ["workflow-1"] };
      },
    };

    const results = await dispatchWorkspaceAutomationsForContentfulWebhook({
      organizationId: scope.organizationId,
      connectionId: contentfulConnection.connection.id,
      contentfulWebhookEventId: webhookEvent.id,
      entryId: "entry-blog-post",
      contentTypeId: "blogPost",
      queue,
    });

    expect(results).toHaveLength(1);
    expect(enqueuedAutomationIds).toEqual([blogPostAutomation.id]);

    const articleRuns = await listWorkspaceAutomationRuns({
      automationId: articleAutomation.id,
      organizationId: scope.organizationId,
    });
    const blogPostRuns = await listWorkspaceAutomationRuns({
      automationId: blogPostAutomation.id,
      organizationId: scope.organizationId,
    });
    expect(articleRuns).toHaveLength(0);
    expect(blogPostRuns).toHaveLength(1);
  });

  it("dispatches matching GitHub push automations and skips non-matching ones", async () => {
    const scope = await seedDispatchScope();
    const matching = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Validate main pushes",
        instructions: "Run validation on main.",
        projectId: scope.projectId,
        triggerConfig: { mode: "github", branches: ["main"] },
        repositoryTarget: {
          kind: "github",
          githubInstallationRepositoryId: scope.repository.id,
        },
        toolConfig: {
          github: {
            enabled: true,
            mode: "sync",
            pushSource: false,
            pullTranslations: false,
            validation: true,
          },
        },
      }),
    );
    expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Release-only push",
        instructions: "Run validation on release branches.",
        projectId: scope.projectId,
        triggerConfig: { mode: "github", branches: ["release/*"] },
        repositoryTarget: {
          kind: "github",
          githubInstallationRepositoryId: scope.repository.id,
        },
        toolConfig: {
          github: {
            enabled: true,
            mode: "sync",
            pushSource: false,
            pullTranslations: false,
            validation: true,
          },
        },
      }),
    );
    expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Agent-only GitHub automation",
        instructions: "Use the GitHub agent.",
        projectId: scope.projectId,
        triggerConfig: { mode: "manual" },
        repositoryTarget: {
          kind: "github",
          githubInstallationRepositoryId: scope.repository.id,
        },
        toolConfig: {
          github: {
            enabled: true,
            mode: "agent",
            pushSource: false,
            pullTranslations: false,
            validation: false,
          },
        },
      }),
    );

    const enqueued: Array<{ workspaceAutomationRunId: string; organizationId: string }> = [];
    const queue = {
      async enqueue(event: { workspaceAutomationRunId: string; organizationId: string }) {
        enqueued.push(event);
        return { ids: ["workflow-1"] };
      },
    };

    const first = await dispatchWorkspaceAutomationsForGithubPush({
      deliveryId: "delivery-github-1",
      organizationId: scope.organizationId,
      githubInstallationRepositoryId: scope.repository.id,
      branch: "main",
      commitBefore: "aaa111",
      commitAfter: "bbb222",
      queue,
    });
    const second = await dispatchWorkspaceAutomationsForGithubPush({
      deliveryId: "delivery-github-1",
      organizationId: scope.organizationId,
      githubInstallationRepositoryId: scope.repository.id,
      branch: "main",
      commitBefore: "aaa111",
      commitAfter: "bbb222",
      queue,
    });

    expect(first).toHaveLength(1);
    expect(first[0]?.outcome).toBe("enqueued");
    expect(second).toHaveLength(1);
    expect(second[0]?.inserted).toBe(false);
    expect(enqueued).toHaveLength(1);

    const runs = await listWorkspaceAutomationRuns({
      automationId: matching.id,
      organizationId: scope.organizationId,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.idempotencyKey).toBe(
      buildWorkspaceGithubPushAutomationIdempotencyKey({
        automationId: matching.id,
        configVersion: matching.configVersion,
        githubDeliveryId: "delivery-github-1",
      }),
    );
    expect(runs[0]?.inputSnapshot).toMatchObject({
      githubDeliveryId: "delivery-github-1",
      pushBranch: "main",
      commitBefore: "aaa111",
      commitAfter: "bbb222",
    });
  });

  it("dispatches GitHub agent automations on matching pushes", async () => {
    const scope = await seedDispatchScope();
    const matching = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Notify on push blockers",
        instructions: "Review localisation risk on this push.",
        triggerConfig: { mode: "github", branches: ["main"] },
        repositoryTarget: {
          kind: "github",
          githubInstallationRepositoryId: scope.repository.id,
        },
        toolConfig: {
          github: {
            enabled: true,
            mode: "agent",
            pushSource: false,
            pullTranslations: false,
            validation: false,
          },
          githubComment: { enabled: true },
        },
      }),
    );

    const enqueued: Array<{ workspaceAutomationRunId: string; organizationId: string }> = [];
    const queue = {
      async enqueue(event: { workspaceAutomationRunId: string; organizationId: string }) {
        enqueued.push(event);
        return { ids: ["workflow-1"] };
      },
    };

    const results = await dispatchWorkspaceAutomationsForGithubPush({
      deliveryId: "delivery-github-agent-1",
      organizationId: scope.organizationId,
      githubInstallationRepositoryId: scope.repository.id,
      branch: "main",
      commitBefore: "aaa111",
      commitAfter: "bbb222",
      queue,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.outcome).toBe("enqueued");
    expect(enqueued).toHaveLength(1);

    const runs = await listWorkspaceAutomationRuns({
      automationId: matching.id,
      organizationId: scope.organizationId,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.inputSnapshot).toMatchObject({
      githubDeliveryId: "delivery-github-agent-1",
      pushBranch: "main",
      commitBefore: "aaa111",
      commitAfter: "bbb222",
    });
  });

  it("dispatches GitHub agent automations on matching pull requests", async () => {
    const scope = await seedDispatchScope();
    const matching = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Notify on push blockers",
        instructions: "Review localisation risk on this pull request.",
        triggerConfig: { mode: "github", branches: ["main"], events: ["pull_request"] },
        repositoryTarget: {
          kind: "github",
          githubInstallationRepositoryId: scope.repository.id,
        },
        toolConfig: {
          github: {
            enabled: true,
            mode: "agent",
            pushSource: false,
            pullTranslations: false,
            validation: false,
          },
          githubComment: { enabled: true },
        },
      }),
    );
    expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Push only GitHub automation",
        instructions: "Should not run for pull requests.",
        projectId: scope.projectId,
        triggerConfig: { mode: "github", branches: ["main"] },
        repositoryTarget: {
          kind: "github",
          githubInstallationRepositoryId: scope.repository.id,
        },
        toolConfig: {
          github: {
            enabled: true,
            mode: "sync",
            pushSource: false,
            pullTranslations: false,
            validation: true,
          },
        },
      }),
    );

    const enqueued: Array<{ workspaceAutomationRunId: string; organizationId: string }> = [];
    const queue = {
      async enqueue(event: { workspaceAutomationRunId: string; organizationId: string }) {
        enqueued.push(event);
        return { ids: ["workflow-1"] };
      },
    };

    const results = await dispatchWorkspaceAutomationsForGithubPullRequest({
      deliveryId: "delivery-github-pr-1",
      organizationId: scope.organizationId,
      githubInstallationRepositoryId: scope.repository.id,
      action: "opened",
      pullRequestNumber: 42,
      pullRequestUrl: "https://github.com/acme/app/pull/42",
      baseBranch: "main",
      headBranch: "feature/review",
      commitBefore: "aaa111",
      commitAfter: "bbb222",
      queue,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.outcome).toBe("enqueued");
    expect(enqueued).toHaveLength(1);

    const runs = await listWorkspaceAutomationRuns({
      automationId: matching.id,
      organizationId: scope.organizationId,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.inputSnapshot).toMatchObject({
      githubDeliveryId: "delivery-github-pr-1",
      githubEvent: "pull_request",
      githubAction: "opened",
      pullRequestNumber: 42,
      baseBranch: "main",
      headBranch: "feature/review",
      pushBranch: "main",
      commitBefore: "aaa111",
      commitAfter: "bbb222",
    });
  });

  it("dispatches source-upload automations scoped to the matching project", async () => {
    const scope = await seedDispatchScope();
    const otherProjectId = `project-other-${scope.organizationId.slice(0, 8)}`;
    await db.insert(schema.projects).values({
      id: otherProjectId,
      organizationId: scope.organizationId,
      createdByUserId: scope.userId,
      name: "Other project",
    });

    const matching = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Translate uploads",
        instructions: "Create a native TMS job for uploads.",
        projectId: scope.projectId,
        triggerConfig: { mode: "source_upload" },
        repositoryTarget: { kind: "none" },
        toolConfig: {
          createNativeTmsJob: {
            enabled: true,
            useProjectTargetLocales: true,
            targetLocales: [],
          },
          assignTranslateWithAgent: {
            enabled: true,
          },
        },
      }),
    );
    const otherProjectAutomation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Other project uploads",
        instructions: "Should not run for this project.",
        projectId: otherProjectId,
        triggerConfig: { mode: "source_upload" },
        repositoryTarget: { kind: "none" },
        toolConfig: {
          createNativeTmsJob: {
            enabled: true,
            useProjectTargetLocales: true,
            targetLocales: [],
          },
          assignTranslateWithAgent: {
            enabled: true,
          },
        },
      }),
    );

    const enqueued: Array<{ workspaceAutomationRunId: string; organizationId: string }> = [];
    const queue = {
      async enqueue(event: { workspaceAutomationRunId: string; organizationId: string }) {
        enqueued.push(event);
        return { ids: ["workflow-1"] };
      },
    };

    const results = await dispatchWorkspaceAutomationsForSourceUpload({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      sourceFileId: "file-1",
      sourceFileVersionId: "version-1",
      sourcePath: "locales/en.json",
      sourceHash: "hash-1",
      queue,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.outcome).toBe("enqueued");
    expect(enqueued).toHaveLength(1);

    const matchingRuns = await listWorkspaceAutomationRuns({
      automationId: matching.id,
      organizationId: scope.organizationId,
    });
    const otherRuns = await listWorkspaceAutomationRuns({
      automationId: otherProjectAutomation.id,
      organizationId: scope.organizationId,
    });
    expect(matchingRuns).toHaveLength(1);
    expect(otherRuns).toHaveLength(0);
    expect(matchingRuns[0]?.inputSnapshot).toMatchObject({
      projectId: scope.projectId,
      sourceFileId: "file-1",
      sourceFileVersionId: "version-1",
      sourcePath: "locales/en.json",
      sourceHash: "hash-1",
    });
  });

  it("deduplicates identical source content across upload versions", async () => {
    const scope = await seedDispatchScope();
    const automation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Translate uploads once",
        instructions: "Translate each changed source file once.",
        projectId: scope.projectId,
        triggerConfig: { mode: "source_upload" },
        repositoryTarget: { kind: "none" },
        toolConfig: {
          createNativeTmsJob: {
            enabled: true,
            useProjectTargetLocales: true,
            targetLocales: [],
          },
          assignTranslateWithAgent: {
            enabled: true,
          },
        },
      }),
    );
    const enqueued: Array<{ workspaceAutomationRunId: string; organizationId: string }> = [];
    const queue = {
      async enqueue(event: { workspaceAutomationRunId: string; organizationId: string }) {
        enqueued.push(event);
        return { ids: [`workflow-${enqueued.length}`] };
      },
    };
    const baseUpload = {
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      sourceFileId: "file-1",
      sourcePath: "locales/en.json",
      sourceHash: "same-content-hash",
      queue,
    };

    const [first] = await dispatchWorkspaceAutomationsForSourceUpload({
      ...baseUpload,
      sourceFileVersionId: "version-1",
    });
    const [duplicate] = await dispatchWorkspaceAutomationsForSourceUpload({
      ...baseUpload,
      sourceFileId: "file-2",
      sourceFileVersionId: "version-2",
    });

    expect(first?.inserted).toBe(true);
    expect(duplicate).toMatchObject({
      outcome: "enqueued",
      runId: first?.runId,
      inserted: false,
    });
    expect(enqueued).toHaveLength(1);

    const [changed] = await dispatchWorkspaceAutomationsForSourceUpload({
      ...baseUpload,
      sourceFileId: "file-3",
      sourceFileVersionId: "version-3",
      sourceHash: "changed-content-hash",
    });

    expect(changed?.inserted).toBe(true);
    expect(changed?.runId).not.toBe(first?.runId);
    expect(enqueued).toHaveLength(2);

    const runs = await listWorkspaceAutomationRuns({
      automationId: automation.id,
      organizationId: scope.organizationId,
    });
    expect(runs).toHaveLength(2);
  });

  it("deduplicates concurrent identical source content dispatches", async () => {
    const scope = await seedDispatchScope();
    const automation = expectOk(
      await createWorkspaceAutomation({
        organizationId: scope.organizationId,
        authorUserId: scope.userId,
        name: "Translate concurrent uploads once",
        instructions: "Translate each changed source file once.",
        projectId: scope.projectId,
        triggerConfig: { mode: "source_upload" },
        repositoryTarget: { kind: "none" },
        toolConfig: {
          createNativeTmsJob: {
            enabled: true,
            useProjectTargetLocales: true,
            targetLocales: [],
          },
          assignTranslateWithAgent: {
            enabled: true,
          },
        },
      }),
    );
    const enqueued: Array<{ workspaceAutomationRunId: string; organizationId: string }> = [];
    const queue = {
      async enqueue(event: { workspaceAutomationRunId: string; organizationId: string }) {
        enqueued.push(event);
        return { ids: [`workflow-${enqueued.length}`] };
      },
    };
    const baseUpload = {
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      sourcePath: "locales/en.json",
      sourceHash: "same-concurrent-content-hash",
      queue,
    };

    const results = await Promise.all([
      dispatchWorkspaceAutomationsForSourceUpload({
        ...baseUpload,
        sourceFileId: "file-1",
        sourceFileVersionId: "version-1",
      }),
      dispatchWorkspaceAutomationsForSourceUpload({
        ...baseUpload,
        sourceFileId: "file-2",
        sourceFileVersionId: "version-2",
      }),
    ]);

    const runs = await listWorkspaceAutomationRuns({
      automationId: automation.id,
      organizationId: scope.organizationId,
    });

    expect(results.flat()).toHaveLength(2);
    expect(new Set(results.flat().map((result) => result.runId)).size).toBe(1);
    expect(runs).toHaveLength(1);
    expect(enqueued).toHaveLength(1);
  });

  it("retries identical source content after the previous run failed", async () => {
    const scope = await seedDispatchScope();
    const automation = await seedSourceUploadAutomation({
      organizationId: scope.organizationId,
      userId: scope.userId,
      projectId: scope.projectId,
      name: "Retry failed uploads",
    });
    const enqueued: Array<{ workspaceAutomationRunId: string; organizationId: string }> = [];
    const queue = {
      async enqueue(event: { workspaceAutomationRunId: string; organizationId: string }) {
        enqueued.push(event);
        return { ids: [`workflow-${enqueued.length}`] };
      },
    };
    const baseUpload = {
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      sourcePath: "locales/en.json",
      sourceHash: "retried-content-hash",
      queue,
    };

    const [first] = await dispatchWorkspaceAutomationsForSourceUpload({
      ...baseUpload,
      sourceFileId: "file-1",
      sourceFileVersionId: "version-1",
    });
    if (!first) {
      throw new Error("expected the first upload to dispatch a run");
    }
    expect(first.inserted).toBe(true);

    await updateWorkspaceAutomationRun({
      runId: first.runId,
      organizationId: scope.organizationId,
      status: "failed",
      completedAt: new Date(),
    });

    const [retried] = await dispatchWorkspaceAutomationsForSourceUpload({
      ...baseUpload,
      sourceFileId: "file-2",
      sourceFileVersionId: "version-2",
    });
    if (!retried) {
      throw new Error("expected the re-upload to dispatch a run");
    }

    expect(retried.inserted).toBe(true);
    expect(retried.runId).not.toBe(first.runId);
    expect(enqueued).toHaveLength(2);

    const contentKey = buildWorkspaceSourceUploadAutomationIdempotencyKey({
      automationId: automation.id,
      configVersion: automation.configVersion,
      projectId: scope.projectId,
      sourcePath: baseUpload.sourcePath,
      sourceHash: baseUpload.sourceHash,
      sourceFileVersionId: "version-1",
    });
    const runs = await listWorkspaceAutomationRuns({
      automationId: automation.id,
      organizationId: scope.organizationId,
    });
    const runIdempotencyKeys = runs.map((run) => run.idempotencyKey);
    expect(runs).toHaveLength(2);
    expect(runIdempotencyKeys).toContain(contentKey);
    expect(runIdempotencyKeys).toContain(`${contentKey}:retry:1`);

    await updateWorkspaceAutomationRun({
      runId: retried.runId,
      organizationId: scope.organizationId,
      status: "succeeded",
      completedAt: new Date(),
    });

    const [duplicate] = await dispatchWorkspaceAutomationsForSourceUpload({
      ...baseUpload,
      sourceFileId: "file-3",
      sourceFileVersionId: "version-3",
    });

    expect(duplicate).toMatchObject({
      outcome: "enqueued",
      runId: retried.runId,
      inserted: false,
    });
    expect(enqueued).toHaveLength(2);
  });

  it("collapses concurrent retries of identical source content into one run", async () => {
    const scope = await seedDispatchScope();
    const automation = await seedSourceUploadAutomation({
      organizationId: scope.organizationId,
      userId: scope.userId,
      projectId: scope.projectId,
      name: "Retry concurrent failed uploads",
    });
    const enqueued: Array<{ workspaceAutomationRunId: string; organizationId: string }> = [];
    const queue = {
      async enqueue(event: { workspaceAutomationRunId: string; organizationId: string }) {
        enqueued.push(event);
        return { ids: [`workflow-${enqueued.length}`] };
      },
    };
    const baseUpload = {
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      sourcePath: "locales/en.json",
      sourceHash: "concurrent-retry-content-hash",
      queue,
    };

    const [first] = await dispatchWorkspaceAutomationsForSourceUpload({
      ...baseUpload,
      sourceFileId: "file-1",
      sourceFileVersionId: "version-1",
    });
    if (!first) {
      throw new Error("expected the first upload to dispatch a run");
    }

    await updateWorkspaceAutomationRun({
      runId: first.runId,
      organizationId: scope.organizationId,
      status: "cancelled",
      completedAt: new Date(),
    });

    const results = (
      await Promise.all([
        dispatchWorkspaceAutomationsForSourceUpload({
          ...baseUpload,
          sourceFileId: "file-2",
          sourceFileVersionId: "version-2",
        }),
        dispatchWorkspaceAutomationsForSourceUpload({
          ...baseUpload,
          sourceFileId: "file-3",
          sourceFileVersionId: "version-3",
        }),
      ])
    ).flat();

    const retriedRunIds = new Set(results.map((result) => result.runId));
    expect(results).toHaveLength(2);
    expect(retriedRunIds.size).toBe(1);
    expect(retriedRunIds.has(first.runId)).toBe(false);
    expect(enqueued).toHaveLength(2);

    const runs = await listWorkspaceAutomationRuns({
      automationId: automation.id,
      organizationId: scope.organizationId,
    });
    expect(runs).toHaveLength(2);
  });
});
