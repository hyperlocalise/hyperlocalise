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
