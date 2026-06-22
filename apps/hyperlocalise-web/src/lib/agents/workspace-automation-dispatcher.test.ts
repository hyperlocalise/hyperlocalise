import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";
import { type Result } from "@/lib/primitives/result/results";

import { createContentfulConnection } from "@/lib/contentful/connections";

import { createWorkspaceAutomation, listWorkspaceAutomationRuns } from "./workspace-automations";

function expectOk<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error("expected ok result");
  }
  return result.value;
}
import {
  dispatchContentfulWorkspaceAutomationForManual,
  dispatchContentfulWorkspaceAutomationForSchedule,
  dispatchWorkspaceAutomationForSchedule,
  dispatchWorkspaceAutomationsForContentfulWebhook,
} from "./workspace-automation-dispatcher";

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
            projectId: scope.projectId,
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
        triggerConfig: { mode: "contentful" },
        repositoryTarget: { kind: "none" },
        toolConfig: {
          contentful: {
            enabled: true,
            connectionId: contentfulConnection.connection.id,
            projectId: scope.projectId,
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
          triggerConfig: { mode: "github", branches: ["main"] },
          repositoryTarget: {
            kind: "github",
            githubInstallationRepositoryId: scope.repository.id,
          },
          toolConfig: {
            github: {
              enabled: true,
              mode: "sync",
              projectId: scope.projectId,
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
      projectId: scope.projectId,
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
      toolConfig: {
        contentful: {
          ...baseToolConfig,
          projectId: undefined,
        },
      },
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
        triggerConfig: { mode: "contentful" },
        repositoryTarget: { kind: "none" },
        toolConfig: {
          contentful: {
            enabled: true,
            connectionId: contentfulConnection.connection.id,
            projectId: scope.projectId,
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
        triggerConfig: { mode: "contentful" },
        repositoryTarget: { kind: "none" },
        toolConfig: {
          contentful: {
            enabled: true,
            connectionId: contentfulConnection.connection.id,
            projectId: scope.projectId,
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
        triggerConfig: { mode: "contentful" },
        repositoryTarget: { kind: "none" },
        toolConfig: {
          contentful: {
            enabled: true,
            connectionId: contentfulConnection.connection.id,
            projectId: scope.projectId,
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
});
