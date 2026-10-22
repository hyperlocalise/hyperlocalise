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

import { listReportJobs } from "./word-count-report";
import type { MatchBucket } from "./word-analysis";

const projectFixture = createProjectTestFixture();
const IN_RANGE = new Date("2026-08-15T12:00:00.000Z");

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

async function seedJob() {
  const { organization, project, user } = await projectFixture.createStoredProjectFixture();
  const [job] = await db
    .insert(schema.jobs)
    .values({
      id: `job_${randomUUID()}`,
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: user.id,
      kind: "translation",
      status: "succeeded",
      inputPayload: { metadata: { title: "Checkout strings" } },
    })
    .returning();
  const analyse = async (input: {
    segment: string;
    locale: string;
    bucket: MatchBucket;
    words: number;
    completed?: boolean;
    isCurrent?: boolean;
  }) => {
    const [analysis] = await db
      .insert(schema.reportingAnalyses)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        jobId: job.id,
        step: "translation",
        segmentId: input.segment,
        sourceRevision: `rev_${randomUUID()}`,
        sourceLocale: "en-US",
        targetLocale: input.locale,
        words: input.words,
        bucket: input.bucket,
        isCurrent: input.isCurrent ?? true,
        createdAt: IN_RANGE,
      })
      .returning();
    if (input.completed) {
      await db.insert(schema.reportingActivity).values({
        organizationId: organization.id,
        projectId: project.id,
        jobId: job.id,
        operationKey: `completion:${analysis.id}:translation`,
        kind: "completion",
        step: "translation",
        targetLocale: input.locale,
        analysisId: analysis.id,
        createdAt: IN_RANGE,
      });
    }
  };
  await analyse({ segment: "a", locale: "de-DE", bucket: "100", words: 4, completed: true });
  await analyse({ segment: "b", locale: "de-DE", bucket: "new", words: 10, completed: true });
  await analyse({ segment: "c", locale: "de-DE", bucket: "new", words: 6 });
  await analyse({ segment: "a", locale: "fr-FR", bucket: "95-99", words: 4 });
  await analyse({ segment: "old", locale: "de-DE", bucket: "new", words: 99, isCurrent: false });
  return { organization, project, job };
}

describe("listReportJobs", () => {
  it("lists jobs with Reports data, with their titles", async () => {
    const { organization, project, job } = await seedJob();

    const jobs = await listReportJobs({
      organizationId: organization.id,
      projectIds: [project.id],
    });

    expect(jobs).toEqual([
      {
        id: job.id,
        title: "Checkout strings",
        projectId: project.id,
        status: job.status,
        createdAt: expect.anything(),
      },
    ]);

    const scope = { organizationId: organization.id, projectIds: [project.id] };
    await expect(listReportJobs({ ...scope, q: "checkout" })).resolves.toHaveLength(1);
    await expect(listReportJobs({ ...scope, q: "invoice" })).resolves.toEqual([]);
    // Wildcards in the search are matched as themselves.
    await expect(listReportJobs({ ...scope, q: "%" })).resolves.toEqual([]);
    await expect(listReportJobs({ ...scope, ids: [job.id] })).resolves.toHaveLength(1);
    await expect(listReportJobs({ ...scope, ids: ["job_other"] })).resolves.toEqual([]);
    // The seeded task has finished, so it is not open.
    expect(job.status).toBe("succeeded");
    await expect(listReportJobs({ ...scope, open: true })).resolves.toEqual([]);
  });
});
