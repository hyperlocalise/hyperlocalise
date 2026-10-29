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

import { markTaskDone } from "./mark-task-done";

vi.mock("@/lib/flags/workspace-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workspace-flags")>();
  return { ...actual, resolveWorkspaceReportsFlag: vi.fn(async () => true) };
});

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

describe("markTaskDone with Reports", () => {
  it("charges a proofread task's fixed fee once when it is marked done", async () => {
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
    const [rate] = await db
      .insert(schema.reportingTaskRates)
      .values({
        organizationId: organization.id,
        jobId: task!.id,
        step: "review",
        overrideUsd: "50",
      })
      .returning();
    const input = {
      organizationId: organization.id,
      jobId: task!.id,
      actorUserId: user.id,
      actorMayFinishAnyTask: true,
      accessWhere: eq(schema.jobs.organizationId, organization.id),
    };

    await markTaskDone(input);
    await markTaskDone(input);

    const costs = await db
      .select({
        operationKey: schema.reportingCosts.operationKey,
        amountUsd: schema.reportingCosts.amountUsd,
        step: schema.reportingCosts.step,
      })
      .from(schema.reportingCosts)
      .where(eq(schema.reportingCosts.jobId, task!.id));
    expect(costs).toEqual([
      { operationKey: `task-override:${rate!.id}`, amountUsd: "50.00000000", step: "review" },
    ]);
  });
});
