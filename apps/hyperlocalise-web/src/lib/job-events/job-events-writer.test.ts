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

import { asc, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { db, schema } from "@/lib/database/client";

import { recordJobEvents } from "./job-events-writer";

const organizationIds: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const organizationId of organizationIds.splice(0)) {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
  }
});

async function insertJob() {
  const organizationId = randomUUID();
  organizationIds.push(organizationId);
  await db.insert(schema.organizations).values({
    id: organizationId,
    workosOrganizationId: `org_${organizationId}`,
    slug: `job-events-${organizationId.slice(0, 8)}`,
    name: "Job Events Test Org",
  });
  const jobId = `job_${randomUUID()}`;
  await db.insert(schema.jobs).values({
    id: jobId,
    organizationId,
    kind: "translation",
    status: "running",
    inputPayload: {},
  });
  return { jobId, organizationId };
}

describe("recordJobEvents", () => {
  it("stores events with the job's organization in order", async () => {
    const { jobId, organizationId } = await insertJob();
    await db.update(schema.jobs).set({ workflowRunId: "run-1" }).where(eq(schema.jobs.id, jobId));

    await recordJobEvents({
      jobId,
      workflowRunId: "run-1",
      events: [
        { type: "job_started", payload: { targetLocales: ["fr-FR"] } },
        {
          type: "locale_progress",
          locale: "fr-FR",
          payload: { translatedCount: 4, totalCount: 10 },
        },
      ],
    });

    const rows = await db
      .select()
      .from(schema.jobEvents)
      .where(eq(schema.jobEvents.jobId, jobId))
      .orderBy(asc(schema.jobEvents.createdAt));
    expect(rows).toMatchObject([
      { organizationId, workflowRunId: "run-1", type: "job_started", locale: null },
      {
        type: "locale_progress",
        locale: "fr-FR",
        payload: { translatedCount: 4, totalCount: 10 },
      },
    ]);
  });

  it("ignores workflow events when the run no longer owns the job", async () => {
    const { jobId } = await insertJob();
    await db
      .update(schema.jobs)
      .set({ workflowRunId: "run-current" })
      .where(eq(schema.jobs.id, jobId));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await recordJobEvents({
      jobId,
      workflowRunId: "run-stale",
      events: [
        {
          type: "locale_progress",
          locale: "fr-FR",
          payload: { translatedCount: 1, totalCount: 2 },
        },
      ],
    });

    const rows = await db.select().from(schema.jobEvents).where(eq(schema.jobEvents.jobId, jobId));
    expect(rows).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      "[job-events] ignored events from stale workflow run",
      expect.objectContaining({
        jobId,
        workflowRunId: "run-stale",
        currentWorkflowRunId: "run-current",
      }),
    );
  });

  it("records user-action events without a workflow run when ownership was cleared", async () => {
    const { jobId } = await insertJob();
    await db.update(schema.jobs).set({ workflowRunId: null }).where(eq(schema.jobs.id, jobId));

    await recordJobEvents({
      jobId,
      events: [{ type: "job_cancelled", payload: {} }],
    });

    const rows = await db.select().from(schema.jobEvents).where(eq(schema.jobEvents.jobId, jobId));
    expect(rows).toMatchObject([{ type: "job_cancelled", workflowRunId: null, actorUserId: null }]);
  });

  it("ignores unknown jobs without throwing", async () => {
    await expect(
      recordJobEvents({
        jobId: `job_${randomUUID()}`,
        events: [{ type: "job_retried", payload: {} }],
      }),
    ).resolves.toBeUndefined();
  });

  it("logs and swallows write failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failingDatabase = {
      select: () => {
        throw new Error("connection lost");
      },
      insert: db.insert.bind(db),
    } as unknown as Parameters<typeof recordJobEvents>[1];

    await expect(
      recordJobEvents(
        { jobId: "job_1", events: [{ type: "job_cancelled", payload: {} }] },
        failingDatabase,
      ),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "[job-events] failed to record job events",
      expect.objectContaining({ jobId: "job_1", eventTypes: ["job_cancelled"] }),
    );
  });
});
