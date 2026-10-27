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

import { db, schema } from "@/lib/database/client";

import { createReportingTestFixture } from "./reporting.fixture";
import { lockedPricingSteps } from "./task-pricing";

const reporting = createReportingTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await reporting.cleanup();
});

describe("lockedPricingSteps", () => {
  it("locks every step once a task has ended, and only worked steps while it is open", async () => {
    const { organization, project, user, createJob } = await reporting.createWorkspace();
    const open = await createJob({ status: "queued" });
    const ended = await createJob({ status: "succeeded" });

    expect([
      ...(await lockedPricingSteps({
        organizationId: organization.id,
        jobId: open.id,
        status: open.status,
      })),
    ]).toEqual([]);
    expect(
      await lockedPricingSteps({
        organizationId: organization.id,
        jobId: ended.id,
        status: ended.status,
      }),
    ).toEqual(new Set(["translation", "review"]));

    await db.insert(schema.reportingTimeEntries).values({
      organizationId: organization.id,
      projectId: project.id,
      jobId: open.id,
      contributorId: user.id,
      step: "translation",
      targetLocale: "fr-FR",
      workDate: new Date("2026-06-01T00:00:00Z"),
      minutes: 15,
    });
    expect(
      await lockedPricingSteps({
        organizationId: organization.id,
        jobId: open.id,
        status: open.status,
      }),
    ).toEqual(new Set(["translation"]));

    await db.insert(schema.reportingCosts).values({
      organizationId: organization.id,
      projectId: project.id,
      jobId: open.id,
      operationKey: `expense:${randomUUID()}`,
      kind: "expense",
      step: "review",
      amountUsd: "20",
      basis: "manual",
    });
    expect(
      await lockedPricingSteps({
        organizationId: organization.id,
        jobId: open.id,
        status: open.status,
      }),
    ).toEqual(new Set(["translation"]));

    await db.insert(schema.reportingCosts).values({
      organizationId: organization.id,
      projectId: project.id,
      jobId: open.id,
      operationKey: `human:${randomUUID()}`,
      kind: "human",
      step: "review",
      amountUsd: "40",
      basis: "manual",
    });
    expect(
      await lockedPricingSteps({
        organizationId: organization.id,
        jobId: open.id,
        status: open.status,
      }),
    ).toEqual(new Set(["translation", "review"]));
  });

  it("ignores voided time and costs when deciding that work has started", async () => {
    const { organization, project, user, createJob } = await reporting.createWorkspace();
    const job = await createJob({ status: "running" });
    await db.insert(schema.reportingTimeEntries).values({
      organizationId: organization.id,
      projectId: project.id,
      jobId: job.id,
      contributorId: user.id,
      step: "translation",
      targetLocale: "fr-FR",
      workDate: new Date("2026-06-01T00:00:00Z"),
      minutes: 15,
      voided: true,
    });
    await db.insert(schema.reportingCosts).values({
      organizationId: organization.id,
      projectId: project.id,
      jobId: job.id,
      operationKey: `human:${randomUUID()}`,
      kind: "human",
      step: "review",
      amountUsd: "40",
      basis: "manual",
      voided: true,
    });

    expect([
      ...(await lockedPricingSteps({
        organizationId: organization.id,
        jobId: job.id,
        status: job.status,
      })),
    ]).toEqual([]);
  });
});
