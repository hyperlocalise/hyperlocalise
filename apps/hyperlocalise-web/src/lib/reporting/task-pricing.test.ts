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

import { lockedPricingSteps } from "./task-pricing";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

describe("lockedPricingSteps", () => {
  it("locks a step at a person's first cost of work, not at an agent job's AI calls", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    const [job] = await db
      .insert(schema.jobs)
      .values({
        id: `job_${randomUUID()}`,
        organizationId: organization.id,
        projectId: project.id,
        createdByUserId: user.id,
        kind: "translation",
        status: "running",
        inputPayload: {},
      })
      .returning();
    const cost = (kind: "ai" | "human" | "expense", step: "translation" | "review") => ({
      organizationId: organization.id,
      projectId: project.id,
      jobId: job!.id,
      operationKey: `${kind}:${randomUUID()}`,
      kind,
      step,
      basis: "unpriced" as const,
    });
    const locked = () =>
      lockedPricingSteps({ organizationId: organization.id, jobId: job!.id, status: job!.status });

    // The job's first AI call, and an expense, are not work the task's pricing prices.
    await db
      .insert(schema.reportingCosts)
      .values([cost("ai", "translation"), cost("expense", "review")]);
    expect(await locked()).toEqual(new Set());
    await db.insert(schema.reportingCosts).values(cost("human", "review"));
    expect(await locked()).toEqual(new Set(["review"]));
  });
});
