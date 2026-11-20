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

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { isErr, isOk } from "@/lib/primitives/result/results";

import { assertOrganizationCanEnqueueTranslationJobInTransaction } from "./organization-operation-budget";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

type JobShape = {
  kind: "translation" | "proofread" | "review";
  status: "queued" | "running" | "waiting_for_review" | "cancelled";
  assigneeType?: "user" | "agent";
  workflowTaskStep?: string;
  mirrored?: boolean;
  /** Made within the last hour, so it counts towards the hourly rate. */
  recent?: boolean;
};

/** A workspace with `count` jobs of one shape. */
async function workspaceWithJobs(shape: JobShape, count = 50) {
  const { organization, project } = await projectFixture.createStoredProjectFixture();
  const ids = Array.from({ length: count }, () => `job_${randomUUID()}`);
  await db.insert(schema.jobs).values(
    ids.map((id) => ({
      id,
      organizationId: organization.id,
      projectId: project.id,
      kind: shape.kind,
      status: shape.status,
      assigneeType: shape.assigneeType ?? null,
      inputPayload: {
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        metadata: shape.workflowTaskStep ? { workflowTaskStep: shape.workflowTaskStep } : {},
      },
      createdAt: new Date(Date.now() - (shape.recent ? 0 : 2 * 60 * 60 * 1000)),
    })),
  );
  if (shape.mirrored) {
    await db.insert(schema.externalJobDetails).values(
      ids.map((jobId) => ({
        jobId,
        organizationId: organization.id,
        providerKind: "crowdin" as const,
        externalJobId: jobId,
        externalStatus: "todo",
      })),
    );
  }
  return organization.id;
}

function check(organizationId: string, options?: { isPersonTask?: boolean }) {
  return db.transaction((tx) =>
    assertOrganizationCanEnqueueTranslationJobInTransaction(tx, organizationId, options),
  );
}

describe("the limit of 50 open jobs", () => {
  it.each<[string, JobShape]>([
    ["open proofread tasks", { kind: "proofread", status: "waiting_for_review" }],
    [
      "open post-edit tasks with an owner",
      {
        kind: "proofread",
        status: "waiting_for_review",
        assigneeType: "user",
        workflowTaskStep: "edit",
      },
    ],
    ["tasks waiting for an earlier job", { kind: "proofread", status: "queued" }],
    [
      "translate tasks a person holds",
      { kind: "translation", status: "waiting_for_review", workflowTaskStep: "translate" },
    ],
  ])("leaves out %s, so an AI job can still be created", async (_name, shape) => {
    const organizationId = await workspaceWithJobs(shape);
    expect(isOk(await check(organizationId))).toBe(true);
  });

  it.each<[string, JobShape]>([
    ["queued AI jobs", { kind: "translation", status: "queued" }],
    [
      "proofread jobs given to an agent",
      { kind: "proofread", status: "waiting_for_review", assigneeType: "agent" },
    ],
    [
      "proofread jobs mirrored from a provider",
      { kind: "proofread", status: "waiting_for_review", mirrored: true },
    ],
    [
      "queued AI jobs that carry the translate step",
      { kind: "translation", status: "queued", workflowTaskStep: "translate" },
    ],
    [
      "translation jobs waiting for review without the step",
      { kind: "translation", status: "waiting_for_review" },
    ],
    ["AI reviews waiting for review", { kind: "review", status: "waiting_for_review" }],
  ])("counts %s, so an AI job is refused", async (_name, shape) => {
    const organizationId = await workspaceWithJobs(shape);
    const result = await check(organizationId);
    expect(isErr(result) && result.error.message).toContain("50 open jobs");
  });

  it("does not refuse a task for people when 50 AI jobs are open", async () => {
    const organizationId = await workspaceWithJobs({ kind: "translation", status: "queued" });
    expect(isOk(await check(organizationId, { isPersonTask: true }))).toBe(true);
  });
});

describe("the limit of 120 jobs created an hour", () => {
  it.each<[string, JobShape]>([
    ["tasks for people", { kind: "proofread", status: "waiting_for_review", recent: true }],
    ["AI jobs", { kind: "translation", status: "queued", recent: true }],
  ])("refuses a new task for people after 120 %s in the hour", async (_name, shape) => {
    const organizationId = await workspaceWithJobs(shape, 120);
    const result = await check(organizationId, { isPersonTask: true });
    expect(isErr(result) && result.error.message).toContain("rate limit");
  });
});
