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
import { afterEach, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database/client";

import { insertJobs, updateJobs } from "./job-writes";

const organizationIds: string[] = [];

afterEach(async () => {
  for (const organizationId of organizationIds.splice(0)) {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
  }
});

async function insertOrganization() {
  const organizationId = randomUUID();
  organizationIds.push(organizationId);
  await db.insert(schema.organizations).values({
    id: organizationId,
    workosOrganizationId: `org_${organizationId}`,
    slug: `job-writes-${organizationId.slice(0, 8)}`,
    name: "Job Writes Test Org",
  });
  return organizationId;
}

function jobValues(organizationId: string, jobId = `job_${randomUUID()}`) {
  return {
    id: jobId,
    organizationId,
    kind: "translation" as const,
    status: "queued" as const,
    inputPayload: {},
  };
}

async function listChanges(jobId: string) {
  const events = await db
    .select()
    .from(schema.jobChangeEvents)
    .where(eq(schema.jobChangeEvents.jobId, jobId))
    .orderBy(asc(schema.jobChangeEvents.occurredAt));
  return events.map((event) => [event.type, event.fromStatus, event.toStatus]);
}

describe("insertJobs and updateJobs", () => {
  it("record creation, status and assignee changes, and nothing else", async () => {
    const organizationId = await insertOrganization();
    const values = jobValues(organizationId);
    await insertJobs(db, { values });
    const byId = eq(schema.jobs.id, values.id);

    await updateJobs(db, { set: { status: "running" }, where: byId });
    await updateJobs(db, { set: { lastError: "noise" }, where: byId });
    await updateJobs(db, { set: { status: "running", lastError: null }, where: byId });
    await updateJobs(db, { set: { assigneeType: "agent" }, where: byId });
    await updateJobs(db, { set: { status: "succeeded" }, where: byId });

    expect(await listChanges(values.id)).toEqual([
      ["job.created", null, "queued"],
      ["job.status_changed", "queued", "running"],
      ["job.assignee_changed", "running", "running"],
      ["job.status_changed", "running", "succeeded"],
    ]);
  });

  it("records status and assignee changes from the same write", async () => {
    const organizationId = await insertOrganization();
    const values = jobValues(organizationId);
    await insertJobs(db, { values: { ...values, assigneeType: "user" } });

    await updateJobs(db, {
      set: { status: "cancelled", assigneeType: "agent" },
      where: eq(schema.jobs.id, values.id),
    });

    expect(await listChanges(values.id)).toEqual([
      ["job.created", null, "queued"],
      ["job.status_changed", "queued", "cancelled"],
      ["job.assignee_changed", "queued", "cancelled"],
    ]);
  });

  it("records due date and title or description changes", async () => {
    const organizationId = await insertOrganization();
    const values = {
      ...jobValues(organizationId),
      inputPayload: { metadata: { title: "Launch" }, sourceLocale: "en" },
    };
    await insertJobs(db, { values });
    const byId = eq(schema.jobs.id, values.id);
    const dueAt = new Date("2026-12-01T09:00:00Z");

    await updateJobs(db, { set: { dueAt }, where: byId });
    await updateJobs(db, { set: { dueAt: new Date(dueAt) }, where: byId });
    await updateJobs(db, {
      set: { inputPayload: { metadata: { title: "Launch" }, sourceLocale: "fr" } },
      where: byId,
    });
    await updateJobs(db, {
      set: { inputPayload: { metadata: { title: "Launch", description: "Copy" } } },
      where: byId,
    });
    await updateJobs(db, {
      set: { dueAt: null, inputPayload: { metadata: { title: "Relaunch" } } },
      where: byId,
    });

    const events = await db
      .select({ type: schema.jobChangeEvents.type })
      .from(schema.jobChangeEvents)
      .where(eq(schema.jobChangeEvents.jobId, values.id))
      .orderBy(asc(schema.jobChangeEvents.occurredAt));
    const types = events.map((event) => event.type);
    expect(types.slice(0, 3)).toEqual([
      "job.created",
      "job.due_date_changed",
      "job.details_changed",
    ]);
    // The last write's two events share one insert, so their order is not fixed.
    expect(types.slice(3).toSorted()).toEqual(["job.details_changed", "job.due_date_changed"]);
  });

  it("returns the requested columns, as the drizzle builder would", async () => {
    const organizationId = await insertOrganization();
    const values = jobValues(organizationId);
    const [inserted] = await insertJobs(db, { values, returning: "all" });
    expect(inserted).toMatchObject({ id: values.id, status: "queued", organizationId });
    expect(inserted).not.toHaveProperty("__jobId");

    const updated = await updateJobs(db, {
      set: { status: "failed" },
      where: eq(schema.jobs.id, values.id),
      returning: { id: schema.jobs.id, kind: schema.jobs.kind },
    });
    expect(updated).toEqual([{ id: values.id, kind: "translation" }]);

    const untouched = await updateJobs(db, {
      set: { lastError: "x" },
      where: eq(schema.jobs.id, "job_missing"),
      returning: { id: schema.jobs.id },
    });
    expect(untouched).toEqual([]);
  });

  it("tells an upsert's creation from its change, and skips rows doNothing kept", async () => {
    const organizationId = await insertOrganization();
    const values = jobValues(organizationId);
    await insertJobs(db, {
      values,
      onConflict: { action: "doUpdate", set: { status: "running" } },
    });
    // Same status again: no change to report.
    await insertJobs(db, {
      values,
      onConflict: { action: "doUpdate", set: { lastError: "synced" } },
    });
    await insertJobs(db, {
      values,
      onConflict: { action: "doUpdate", set: { status: "cancelled" } },
    });
    const skipped = await insertJobs(db, {
      values: { ...values, status: "failed" },
      onConflict: { action: "doNothing" },
      returning: { id: schema.jobs.id },
    });

    expect(skipped).toEqual([]);
    expect(await listChanges(values.id)).toEqual([
      ["job.created", null, "queued"],
      ["job.status_changed", "queued", "cancelled"],
    ]);
  });

  it("records nothing when the caller's transaction rolls back", async () => {
    const organizationId = await insertOrganization();
    const values = jobValues(organizationId);
    await expect(
      db.transaction(async (tx) => {
        await insertJobs(tx, { values });
        await updateJobs(tx, { set: { status: "running" }, where: eq(schema.jobs.id, values.id) });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    expect(await listChanges(values.id)).toEqual([]);
  });
});
