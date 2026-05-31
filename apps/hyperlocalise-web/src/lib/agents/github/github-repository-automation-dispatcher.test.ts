import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";

import {
  dispatchGithubRepositoryAutomationForPush,
  dispatchGithubRepositoryAutomationForSchedule,
} from "./github-repository-automation-dispatcher";
import {
  buildGithubPushAutomationIdempotencyKey,
  buildGithubScheduledAutomationIdempotencyKey,
} from "./github-repository-automation-idempotency";
import { upsertGithubRepositoryAutomationSettings } from "./github-repository-automation-settings-store";
import { runGithubRepositoryAutomationScheduler } from "./github-repository-automation-scheduler";

const fixture = createProjectTestFixture();

async function seedRepositoryAutomation(input: {
  organizationId: string;
  githubRepositoryId?: string;
}) {
  const githubRepositoryId = input.githubRepositoryId ?? "9001";

  await db.insert(schema.githubInstallations).values({
    organizationId: input.organizationId,
    githubInstallationId: "54321",
    githubAppId: "123",
    accountLogin: "hyperlocalise",
    accountType: "Organization",
  });

  const [repository] = await db
    .insert(schema.githubInstallationRepositories)
    .values({
      organizationId: input.organizationId,
      githubInstallationId: "54321",
      githubRepositoryId,
      owner: "hyperlocalise",
      name: "hyperlocalise",
      fullName: "hyperlocalise/hyperlocalise",
      private: false,
      archived: false,
      defaultBranch: "main",
      enabled: true,
    })
    .returning();

  return repository!;
}

describe("github repository automation dispatch", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("builds stable idempotency keys", () => {
    const scheduledAt = new Date("2026-05-30T12:00:00.000Z");

    expect(buildGithubPushAutomationIdempotencyKey({ githubDeliveryId: "delivery-1" })).toBe(
      "push:delivery-1",
    );
    expect(
      buildGithubScheduledAutomationIdempotencyKey({
        githubInstallationRepositoryId: "repo-row",
        configVersion: 2,
        scheduledRunAt: scheduledAt,
      }),
    ).toBe("scheduled:repo-row:2:2026-05-30T12:00:00.000Z");
  });

  it("records skipped jobs for non-configured push branches", async () => {
    const identity = fixture.createWorkosIdentity();
    await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;
    if (!auth) {
      throw new Error("missing auth context");
    }

    const repository = await seedRepositoryAutomation({
      organizationId: auth.organization.localOrganizationId,
    });

    await upsertGithubRepositoryAutomationSettings({
      organizationId: auth.organization.localOrganizationId,
      githubInstallationRepositoryId: repository.id,
      githubRepositoryId: repository.githubRepositoryId,
      settings: {
        workflows: { pushSource: { enabled: true } },
        trigger: { mode: "push", branches: ["main"] },
      },
    });

    const result = await dispatchGithubRepositoryAutomationForPush({
      deliveryId: "delivery-skip-branch",
      organizationId: auth.organization.localOrganizationId,
      githubInstallationId: "54321",
      githubInstallationRepositoryId: repository.id,
      githubRepositoryId: repository.githubRepositoryId,
      branch: "feature/unconfigured",
      commitBefore: "abc",
      commitAfter: "def",
    });

    expect(result.outcome).toBe("skipped");
    if (result.outcome !== "skipped") {
      throw new Error("expected skipped outcome");
    }
    expect(result.skipReason).toBe("branch_not_configured");

    const duplicate = await dispatchGithubRepositoryAutomationForPush({
      deliveryId: "delivery-skip-branch",
      organizationId: auth.organization.localOrganizationId,
      githubInstallationId: "54321",
      githubInstallationRepositoryId: repository.id,
      githubRepositoryId: repository.githubRepositoryId,
      branch: "feature/unconfigured",
      commitBefore: "abc",
      commitAfter: "def",
    });

    expect(duplicate.inserted).toBe(false);
    expect(duplicate.job.id).toBe(result.job.id);

    const jobs = await db
      .select()
      .from(schema.githubRepositoryAutomationJobs)
      .where(eq(schema.githubRepositoryAutomationJobs.githubDeliveryId, "delivery-skip-branch"));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe("skipped");
    expect(jobs[0]?.skipReason).toBe("branch_not_configured");
  });

  it("enqueues exactly one queued job per push delivery", async () => {
    const identity = fixture.createWorkosIdentity();
    await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;
    if (!auth) {
      throw new Error("missing auth context");
    }

    const repository = await seedRepositoryAutomation({
      organizationId: auth.organization.localOrganizationId,
    });

    await upsertGithubRepositoryAutomationSettings({
      organizationId: auth.organization.localOrganizationId,
      githubInstallationRepositoryId: repository.id,
      githubRepositoryId: repository.githubRepositoryId,
      settings: {
        workflows: {
          pushSource: { enabled: true },
          pullTranslations: { enabled: true },
        },
        trigger: { mode: "push", branches: ["main"] },
      },
    });

    const input = {
      deliveryId: "delivery-enqueue",
      organizationId: auth.organization.localOrganizationId,
      githubInstallationId: "54321",
      githubInstallationRepositoryId: repository.id,
      githubRepositoryId: repository.githubRepositoryId,
      branch: "main",
      commitBefore: "111",
      commitAfter: "222",
    } as const;

    const first = await dispatchGithubRepositoryAutomationForPush(input);
    const second = await dispatchGithubRepositoryAutomationForPush(input);

    expect(first.outcome).toBe("enqueued");
    expect(first.inserted).toBe(true);
    expect(second.outcome).toBe("enqueued");
    expect(second.inserted).toBe(false);
    expect(second.job.id).toBe(first.job.id);

    const jobs = await db
      .select()
      .from(schema.githubRepositoryAutomationJobs)
      .where(eq(schema.githubRepositoryAutomationJobs.idempotencyKey, "push:delivery-enqueue"));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe("queued");
    expect(jobs[0]?.triggerBranch).toBe("main");
    expect(jobs[0]?.commitBefore).toBe("111");
    expect(jobs[0]?.commitAfter).toBe("222");
    expect(jobs[0]?.workflows).toEqual({
      pushSource: true,
      pullTranslations: true,
      validation: false,
      validationBlockOnFailure: true,
      statusCheck: { enabled: false, mode: "blocking" },
    });
  });

  it("enqueues scheduled jobs once per scheduled run slot", async () => {
    const identity = fixture.createWorkosIdentity();
    await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;
    if (!auth) {
      throw new Error("missing auth context");
    }

    const repository = await seedRepositoryAutomation({
      organizationId: auth.organization.localOrganizationId,
    });

    const settingsRecord = await upsertGithubRepositoryAutomationSettings({
      organizationId: auth.organization.localOrganizationId,
      githubInstallationRepositoryId: repository.id,
      githubRepositoryId: repository.githubRepositoryId,
      settings: {
        workflows: { validation: { enabled: true } },
        trigger: {
          mode: "scheduled",
          cadence: "hourly",
          hourUtc: 0,
          timezone: "UTC",
        },
      },
    });

    const scheduledRunAt = new Date("2026-05-30T11:00:00.000Z");
    const dispatchPayload = {
      configVersion: settingsRecord.configVersion,
      githubInstallationRepositoryId: repository.id,
      organizationId: auth.organization.localOrganizationId,
      githubRepositoryId: repository.githubRepositoryId,
      githubInstallationId: "54321",
      triggerMode: "scheduled" as const,
      workflows: {
        pushSource: false,
        pullTranslations: false,
        validation: true,
        validationBlockOnFailure: true,
        statusCheck: { enabled: false, mode: "blocking" as const },
      },
    };

    const first = await dispatchGithubRepositoryAutomationForSchedule({
      organizationId: auth.organization.localOrganizationId,
      githubInstallationId: "54321",
      githubInstallationRepositoryId: repository.id,
      githubRepositoryId: repository.githubRepositoryId,
      configVersion: settingsRecord.configVersion,
      scheduledRunAt,
      dispatchPayload,
    });
    const second = await dispatchGithubRepositoryAutomationForSchedule({
      organizationId: auth.organization.localOrganizationId,
      githubInstallationId: "54321",
      githubInstallationRepositoryId: repository.id,
      githubRepositoryId: repository.githubRepositoryId,
      configVersion: settingsRecord.configVersion,
      scheduledRunAt,
      dispatchPayload,
    });

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.job.id).toBe(first.job.id);
  });

  it("dispatches due scheduled repositories and advances next run", async () => {
    const identity = fixture.createWorkosIdentity();
    await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;
    if (!auth) {
      throw new Error("missing auth context");
    }

    const repository = await seedRepositoryAutomation({
      organizationId: auth.organization.localOrganizationId,
    });

    const settingsRecord = await upsertGithubRepositoryAutomationSettings({
      organizationId: auth.organization.localOrganizationId,
      githubInstallationRepositoryId: repository.id,
      githubRepositoryId: repository.githubRepositoryId,
      settings: {
        workflows: { pushSource: { enabled: true } },
        trigger: {
          mode: "scheduled",
          cadence: "hourly",
          hourUtc: 0,
          timezone: "UTC",
        },
      },
    });

    await db
      .update(schema.githubRepositoryAutomationSettings)
      .set({ nextRunAt: new Date("2026-05-30T10:00:00.000Z") })
      .where(eq(schema.githubRepositoryAutomationSettings.id, settingsRecord.stored!.id));

    const firstTick = await runGithubRepositoryAutomationScheduler({
      now: new Date("2026-05-30T10:05:00.000Z"),
    });
    const secondTick = await runGithubRepositoryAutomationScheduler({
      now: new Date("2026-05-30T10:10:00.000Z"),
    });

    expect(firstTick.processed).toBe(1);
    expect(firstTick.enqueued).toBe(1);
    expect(secondTick.enqueued).toBe(0);

    const [settingsRow] = await db
      .select()
      .from(schema.githubRepositoryAutomationSettings)
      .where(eq(schema.githubRepositoryAutomationSettings.id, settingsRecord.stored!.id));

    expect(settingsRow?.nextRunAt?.getTime()).toBeGreaterThan(
      new Date("2026-05-30T10:05:00.000Z").getTime(),
    );
  });
});
