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
            projectId: scope.projectId,
            pushSource: false,
            pullTranslations: false,
            validation: true,
          },
        },
        nextRunAt: scheduledRunAt,
      }),
    );

    const first = await dispatchWorkspaceAutomationForSchedule({
      automation,
      repository: {
        id: scope.repository.id,
        githubInstallationId: scope.githubInstallationId,
        githubRepositoryId: scope.githubRepositoryId,
      },
      scheduledRunAt,
    });
    const second = await dispatchWorkspaceAutomationForSchedule({
      automation,
      repository: {
        id: scope.repository.id,
        githubInstallationId: scope.githubInstallationId,
        githubRepositoryId: scope.githubRepositoryId,
      },
      scheduledRunAt,
    });

    expect(first?.outcome).toBe("enqueued");
    expect(second?.outcome).toBe("enqueued");
    expect(second?.inserted).toBe(false);

    const runs = await listWorkspaceAutomationRuns({
      automationId: automation.id,
      organizationId: scope.organizationId,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.githubRepositoryAutomationJobId).toBeTruthy();
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
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
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
    const enqueued: unknown[] = [];
    const queue = {
      async enqueue(event: {
        contentfulTranslationRunId: string;
        workspaceAutomationRunId: string;
        organizationId: string;
      }) {
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

    const translationRuns = await db
      .select()
      .from(schema.contentfulTranslationRuns)
      .where(eq(schema.contentfulTranslationRuns.organizationId, scope.organizationId));
    expect(translationRuns).toHaveLength(1);
    expect(translationRuns[0]?.entryId).toBe("entry-1");
    expect(translationRuns[0]?.sourceLocale).toBe("de-DE");
  });
});
