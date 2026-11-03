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

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { executeContentSyncConfigMock } = vi.hoisted(() => ({
  executeContentSyncConfigMock: vi.fn(),
}));

vi.mock("@/lib/agents/content-sync/execute-content-sync", () => ({
  executeContentSyncConfig: executeContentSyncConfigMock,
}));

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import type { ContentSyncConfig } from "@/lib/agents/content-sync/content-sync-types";
import { db, schema } from "@/lib/database/client";
import { ok, err } from "@/lib/primitives/result/results";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import type { ProjectContentSyncQueue } from "@/lib/workflow/types";

import {
  claimProjectContentSyncRun,
  deleteProjectContentSync,
  executeProjectContentSyncRun,
  failProjectContentSyncRun,
  followingScheduledContentSyncRunAt,
  listProjectContentSyncRuns,
  runDueProjectContentSyncs,
  saveProjectContentSync,
  STALE_CONTENT_SYNC_RUN_MS,
  startProjectContentSyncRun,
} from "./project-content-sync";

const authFixture = createAuthTestFixture();

const HOUR_MS = 60 * 60 * 1000;

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await authFixture.cleanup();
});

async function createSync(input: { schedule?: "manual" | "hourly" | "daily"; now?: Date } = {}) {
  const { organization, user } = await authFixture.createLocalWorkosIdentity();
  const team = await ensureDefaultWorkspaceTeam(organization.id);
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      identifier: uniqueTestProjectIdentifier(),
      organizationId: organization.id,
      teamId: team.id,
      createdByUserId: user.id,
      name: "Sync project",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    })
    .returning();
  const sync = await saveProjectContentSync({
    organizationId: organization.id,
    projectId: project!.id,
    syncConfig: {
      provider: "github",
      connectionId: randomUUID(),
      resourceKey: "acme/web",
      providerFolder: "locales",
      projectFolder: "github/acme/web",
    },
    schedule: input.schedule ?? "manual",
    userId: user.id,
    now: input.now,
  });
  return { organization, user, project: project!, sync };
}

function recordingQueue() {
  const enqueue = vi.fn(async () => ({ ids: ["queued"] }));
  return { enqueue, queue: { enqueue } satisfies ProjectContentSyncQueue };
}

async function readRun(runId: string) {
  const [run] = await db
    .select()
    .from(schema.projectContentSyncRuns)
    .where(eq(schema.projectContentSyncRuns.id, runId));
  return run!;
}

describe("project content sync settings", () => {
  it("keeps the next scheduled time when only the folders change", async () => {
    const now = new Date("2026-11-04T00:00:00.000Z");
    const { organization, project, user, sync } = await createSync({ schedule: "hourly", now });
    expect(sync.nextRunAt?.toISOString()).toBe("2026-11-04T01:00:00.000Z");

    const later = new Date(now.getTime() + 10 * 60 * 1000);
    const resaved = await saveProjectContentSync({
      organizationId: organization.id,
      projectId: project.id,
      syncConfig: { ...(sync.syncConfig as ContentSyncConfig), providerFolder: "i18n" },
      schedule: "hourly",
      userId: user.id,
      now: later,
    });
    expect(resaved.id).toBe(sync.id);
    expect(resaved.nextRunAt?.toISOString()).toBe("2026-11-04T01:00:00.000Z");

    const daily = await saveProjectContentSync({
      organizationId: organization.id,
      projectId: project.id,
      syncConfig: sync.syncConfig as ContentSyncConfig,
      schedule: "daily",
      userId: user.id,
      now: later,
    });
    expect(daily.nextRunAt?.toISOString()).toBe("2026-11-05T00:10:00.000Z");

    const manual = await saveProjectContentSync({
      organizationId: organization.id,
      projectId: project.id,
      syncConfig: sync.syncConfig as ContentSyncConfig,
      schedule: "manual",
      userId: user.id,
      now: later,
    });
    expect(manual.nextRunAt).toBeNull();
  });
});

describe("project content sync run lock", () => {
  it("lets only one of two simultaneous claims run", async () => {
    const { sync } = await createSync();

    const results = await Promise.all([
      claimProjectContentSyncRun({ sync, trigger: "manual", userId: null }),
      claimProjectContentSyncRun({ sync, trigger: "scheduled", userId: null }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, error: { code: "content_sync_in_progress" } },
    ]);
  });

  it("fails a run that outlived the timeout and lets a new one start", async () => {
    const { sync } = await createSync();
    const startedAt = new Date(Date.now() - STALE_CONTENT_SYNC_RUN_MS - 60_000);
    const stale = await claimProjectContentSyncRun({
      sync,
      trigger: "manual",
      userId: null,
      now: startedAt,
    });
    expect(stale.ok).toBe(true);

    const fresh = await claimProjectContentSyncRun({ sync, trigger: "manual", userId: null });

    expect(fresh.ok).toBe(true);
    const staleRun = await readRun(stale.ok ? stale.value.id : "");
    expect(staleRun).toMatchObject({ status: "failed", errorCode: "content_sync_stale" });
  });

  it("does not let one sync's run hold another sync", async () => {
    const first = await createSync();
    const second = await createSync();

    await claimProjectContentSyncRun({ sync: first.sync, trigger: "manual", userId: null });
    const other = await claimProjectContentSyncRun({
      sync: second.sync,
      trigger: "manual",
      userId: null,
    });

    expect(other.ok).toBe(true);
  });
});

describe("executeProjectContentSyncRun", () => {
  it("passes the saved settings to executeContentSyncConfig and records the summary", async () => {
    const { organization, project, sync } = await createSync();
    const summary = {
      pulled: { uploaded: 2, skipped: 1, failed: 0 },
      pushed: { written: 1, pullRequestUrl: "https://github.com/acme/web/pull/7" },
    };
    executeContentSyncConfigMock.mockResolvedValue(ok(summary));
    const { queue, enqueue } = recordingQueue();

    const started = await startProjectContentSyncRun({
      sync,
      trigger: "manual",
      userId: null,
      queue,
    });
    expect(started.ok).toBe(true);
    const runId = started.ok ? started.value.id : "";
    expect(enqueue).toHaveBeenCalledWith({ organizationId: organization.id, runId });

    await executeProjectContentSyncRun({ organizationId: organization.id, runId });

    expect(executeContentSyncConfigMock).toHaveBeenCalledWith({
      organizationId: organization.id,
      projectId: project.id,
      workflowId: sync.id,
      runId,
      syncConfig: expect.objectContaining({
        provider: "github",
        resourceKey: "acme/web",
        providerFolder: "locales",
        projectFolder: "github/acme/web",
      }),
      pullRequestBranchKey: `sync-${sync.id}`,
    });
    expect(await readRun(runId)).toMatchObject({ status: "succeeded", summary });
  });

  it("records the provider's error and a generic one for a thrown error", async () => {
    const { organization, sync } = await createSync();
    executeContentSyncConfigMock.mockResolvedValueOnce(
      err({ code: "content_sync_connection_required", message: "Enable this repository." }),
    );
    const first = await claimProjectContentSyncRun({ sync, trigger: "manual", userId: null });
    const firstId = first.ok ? first.value.id : "";
    await executeProjectContentSyncRun({ organizationId: organization.id, runId: firstId });
    expect(await readRun(firstId)).toMatchObject({
      status: "failed",
      errorCode: "content_sync_connection_required",
      errorMessage: "Enable this repository.",
    });

    executeContentSyncConfigMock.mockRejectedValueOnce(new Error("git push failed: secret output"));
    const second = await claimProjectContentSyncRun({ sync, trigger: "manual", userId: null });
    const secondId = second.ok ? second.value.id : "";
    await executeProjectContentSyncRun({ organizationId: organization.id, runId: secondId });
    expect(await readRun(secondId)).toMatchObject({
      status: "failed",
      errorCode: "content_sync_failed",
      errorMessage: "The sync stopped unexpectedly.",
    });
  });

  it("does not run a run that already finished", async () => {
    const { organization, sync } = await createSync();
    const claimed = await claimProjectContentSyncRun({ sync, trigger: "manual", userId: null });
    const runId = claimed.ok ? claimed.value.id : "";
    await db
      .update(schema.projectContentSyncRuns)
      .set({ status: "failed" })
      .where(eq(schema.projectContentSyncRuns.id, runId));

    await executeProjectContentSyncRun({ organizationId: organization.id, runId });

    expect(executeContentSyncConfigMock).not.toHaveBeenCalled();
  });

  it("marks the run failed when the queue refuses it", async () => {
    const { sync } = await createSync();
    const queue: ProjectContentSyncQueue = {
      enqueue: vi.fn(async () => {
        throw new Error("queue down");
      }),
    };

    await expect(
      startProjectContentSyncRun({ sync, trigger: "manual", userId: null, queue }),
    ).rejects.toThrow("queue down");

    const [run] = await db
      .select()
      .from(schema.projectContentSyncRuns)
      .where(eq(schema.projectContentSyncRuns.syncId, sync.id));
    expect(run).toMatchObject({ status: "failed", errorCode: "content_sync_enqueue_failed" });
  });
});

describe("runDueProjectContentSyncs", () => {
  it("starts due syncs once, moves their next time and skips manual ones", async () => {
    const past = new Date(Date.now() - 2 * HOUR_MS);
    const due = await createSync({ schedule: "hourly", now: past });
    const manual = await createSync({ schedule: "manual", now: past });
    const { queue, enqueue } = recordingQueue();
    const now = new Date();

    const firstTick = await runDueProjectContentSyncs({ limit: 100, queue, now });
    const secondTick = await runDueProjectContentSyncs({ limit: 100, queue, now });

    const startedRunIds = enqueue.mock.calls.map(
      (call) => (call as unknown as [{ runId: string }])[0].runId,
    );
    const runs = await db
      .select()
      .from(schema.projectContentSyncRuns)
      .where(eq(schema.projectContentSyncRuns.syncId, due.sync.id));
    expect(runs.map((run) => run.id).filter((id) => startedRunIds.includes(id))).toHaveLength(1);
    expect(runs[0]).toMatchObject({ trigger: "scheduled", status: "running" });
    expect(firstTick.started).toBeGreaterThanOrEqual(1);
    expect(secondTick.started).toBe(0);

    const [advanced] = await db
      .select({ nextRunAt: schema.projectContentSyncs.nextRunAt })
      .from(schema.projectContentSyncs)
      .where(eq(schema.projectContentSyncs.id, due.sync.id));
    expect(advanced?.nextRunAt?.getTime()).toBe(past.getTime() + 3 * HOUR_MS);

    const manualRuns = await db
      .select()
      .from(schema.projectContentSyncRuns)
      .where(eq(schema.projectContentSyncRuns.syncId, manual.sync.id));
    expect(manualRuns).toHaveLength(0);
  });

  it("moves the next time of a due sync whose last run is still going", async () => {
    const past = new Date(Date.now() - 2 * HOUR_MS);
    const { sync } = await createSync({ schedule: "hourly", now: past });
    await claimProjectContentSyncRun({ sync, trigger: "manual", userId: null });
    const { queue } = recordingQueue();
    const now = new Date();

    await runDueProjectContentSyncs({ limit: 100, queue, now });

    const runs = await db
      .select()
      .from(schema.projectContentSyncRuns)
      .where(eq(schema.projectContentSyncRuns.syncId, sync.id));
    expect(runs).toHaveLength(1);
    const [advanced] = await db
      .select({ nextRunAt: schema.projectContentSyncs.nextRunAt })
      .from(schema.projectContentSyncs)
      .where(eq(schema.projectContentSyncs.id, sync.id));
    expect(advanced?.nextRunAt?.getTime()).toBe(past.getTime() + 3 * HOUR_MS);
  });
});

describe("followingScheduledContentSyncRunAt", () => {
  it("keeps the schedule on its slots when the cron tick is late or several slots were missed", () => {
    const dueAt = new Date("2026-11-04T13:00:00.000Z");

    expect(
      followingScheduledContentSyncRunAt("hourly", dueAt, new Date("2026-11-04T13:14:59.000Z")),
    ).toEqual(new Date("2026-11-04T14:00:00.000Z"));
    expect(
      followingScheduledContentSyncRunAt("hourly", dueAt, new Date("2026-11-04T16:30:00.000Z")),
    ).toEqual(new Date("2026-11-04T17:00:00.000Z"));
    expect(
      followingScheduledContentSyncRunAt("daily", dueAt, new Date("2026-11-04T13:15:00.000Z")),
    ).toEqual(new Date("2026-11-05T13:00:00.000Z"));
  });
});

describe("closing runs", () => {
  it("does not reopen a run that was already failed as stale", async () => {
    const { organization, sync } = await createSync();
    executeContentSyncConfigMock.mockResolvedValue(
      ok({ pulled: { uploaded: 1, skipped: 0, failed: 0 }, pushed: { written: 0 } }),
    );
    const startedAt = new Date(Date.now() - STALE_CONTENT_SYNC_RUN_MS - 60_000);
    const stale = await claimProjectContentSyncRun({
      sync,
      trigger: "manual",
      userId: null,
      now: startedAt,
    });
    const staleId = stale.ok ? stale.value.id : "";
    await claimProjectContentSyncRun({ sync, trigger: "manual", userId: null });

    await db
      .update(schema.projectContentSyncRuns)
      .set({ status: "running" })
      .where(eq(schema.projectContentSyncRuns.id, staleId));
    await db
      .update(schema.projectContentSyncRuns)
      .set({ status: "failed", errorCode: "content_sync_stale" })
      .where(eq(schema.projectContentSyncRuns.id, staleId));
    await failProjectContentSyncRun({ runId: staleId });

    expect(await readRun(staleId)).toMatchObject({
      status: "failed",
      errorCode: "content_sync_stale",
    });
    expect(organization.id).toBeTruthy();
  });

  it("closes a run whose workflow step died", async () => {
    const { sync } = await createSync();
    const claimed = await claimProjectContentSyncRun({ sync, trigger: "manual", userId: null });
    const runId = claimed.ok ? claimed.value.id : "";

    await failProjectContentSyncRun({ runId });

    expect(await readRun(runId)).toMatchObject({
      status: "failed",
      errorCode: "content_sync_failed",
    });
  });

  it("shows a stale run as failed when the runs are listed", async () => {
    const { organization, sync } = await createSync();
    const startedAt = new Date(Date.now() - STALE_CONTENT_SYNC_RUN_MS - 60_000);
    await claimProjectContentSyncRun({ sync, trigger: "manual", userId: null, now: startedAt });

    const runs = await listProjectContentSyncRuns({
      organizationId: organization.id,
      syncId: sync.id,
      limit: 10,
    });

    expect(runs[0]).toMatchObject({ status: "failed", errorCode: "content_sync_stale" });
  });
});

describe("deleteProjectContentSync", () => {
  it("refuses while a run is going and deletes once it has finished", async () => {
    const { organization, project, sync } = await createSync();
    const claimed = await claimProjectContentSyncRun({ sync, trigger: "manual", userId: null });

    expect(
      await deleteProjectContentSync({ organizationId: organization.id, projectId: project.id }),
    ).toEqual({ ok: false, error: { code: "content_sync_in_progress" } });

    await failProjectContentSyncRun({ runId: claimed.ok ? claimed.value.id : "" });
    expect(
      await deleteProjectContentSync({ organizationId: organization.id, projectId: project.id }),
    ).toMatchObject({ ok: true });
  });
});
