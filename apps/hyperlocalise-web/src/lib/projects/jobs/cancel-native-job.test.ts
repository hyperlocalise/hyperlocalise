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

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { isOk } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  captureJobStatus: vi.fn(async () => undefined),
  recordJobEvents: vi.fn(async () => undefined),
  enqueueJobCancelledActivity: vi.fn(async () => undefined),
}));

vi.mock("@/lib/reporting/capture", () => ({ captureJobStatus: mocks.captureJobStatus }));
vi.mock("@/lib/job-events/job-events-writer", () => ({ recordJobEvents: mocks.recordJobEvents }));
vi.mock("@/lib/activity-log/job-automation-events", () => ({
  enqueueJobCancelledActivity: mocks.enqueueJobCancelledActivity,
}));

import { cancelNativeJob } from "./cancel-native-job";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  for (const mock of Object.values(mocks)) mock.mockClear();
  await projectFixture.cleanup();
});

describe("cancelNativeJob", () => {
  it("cancels an open task and tells Reports, so its unfinished strings leave Progress", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    const [task] = await db
      .insert(schema.jobs)
      .values({
        id: `job_${randomUUID()}`,
        organizationId: organization.id,
        projectId: project.id,
        createdByUserId: user.id,
        kind: "proofread",
        status: "waiting_for_review",
        inputPayload: {},
      })
      .returning();

    const result = await cancelNativeJob({
      organizationId: organization.id,
      jobId: task.id,
      actorUserId: user.id,
      accessWhere: eq(schema.jobs.organizationId, organization.id),
    });

    expect(isOk(result) && result.value).toEqual({ id: task.id });
    const [cancelled] = await db
      .select({ status: schema.jobs.status, completedAt: schema.jobs.completedAt })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, task.id));
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.completedAt).not.toBeNull();
    expect(mocks.captureJobStatus).toHaveBeenCalledWith({
      jobId: task.id,
      status: "cancelled",
      operationKey: `cancel:${task.id}`,
    });
  });
});
