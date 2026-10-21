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

import {
  listReportJobs,
  matchAnalysisCsv,
  queryJobMatchAnalysis,
  queryWordVolume,
  wordVolumeCsv,
} from "./word-count-report";
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

describe("queryJobMatchAnalysis", () => {
  it("counts words and strings by language and band, analysed and completed, current rows only", async () => {
    const { organization, job } = await seedJob();

    const rows = await queryJobMatchAnalysis({ organizationId: organization.id, jobId: job.id });

    expect(rows).toEqual([
      {
        targetLocale: "de-DE",
        step: "translation",
        bucket: "100",
        analysedWords: 4,
        analysedSegments: 1,
        completedWords: 4,
        completedSegments: 1,
      },
      {
        targetLocale: "de-DE",
        step: "translation",
        bucket: "new",
        analysedWords: 16,
        analysedSegments: 2,
        completedWords: 10,
        completedSegments: 1,
      },
      {
        targetLocale: "fr-FR",
        step: "translation",
        bucket: "95-99",
        analysedWords: 4,
        analysedSegments: 1,
        completedWords: 0,
        completedSegments: 0,
      },
    ]);
    expect(matchAnalysisCsv(rows).split("\r\n")).toHaveLength(4);
  });
});

describe("queryWordVolume", () => {
  it("totals words per project and language", async () => {
    const { organization, project } = await seedJob();

    const rows = await queryWordVolume({
      organizationId: organization.id,
      projectIds: [project.id],
      from: "2026-08-01",
      to: "2026-08-31",
      groupBy: "project",
    });

    expect(rows).toEqual([
      expect.objectContaining({
        projectName: project.name,
        jobId: null,
        targetLocale: "de-DE",
        analysedWords: 20,
        analysedSegments: 3,
        completedWords: 14,
        completedSegments: 2,
      }),
      expect.objectContaining({
        targetLocale: "fr-FR",
        analysedWords: 4,
        completedWords: 0,
      }),
    ]);
  });

  it("totals words per job and language with the job's title", async () => {
    const { organization, project, job } = await seedJob();

    const rows = await queryWordVolume({
      organizationId: organization.id,
      projectIds: [project.id],
      from: "2026-08-01",
      to: "2026-08-31",
      groupBy: "job",
      targetLocale: "de-DE",
    });

    expect(rows).toEqual([
      expect.objectContaining({ jobId: job.id, jobTitle: "Checkout strings", analysedWords: 20 }),
    ]);
    expect(wordVolumeCsv(rows, "job").split("\r\n")[0]).toContain("jobTitle");
  });

  it("totals only the chosen job when one is given", async () => {
    const { organization, project, job } = await seedJob();
    const [otherJob] = await db
      .insert(schema.jobs)
      .values({
        id: `job_${randomUUID()}`,
        organizationId: organization.id,
        projectId: project.id,
        createdByUserId: job.createdByUserId,
        kind: "translation",
        status: "succeeded",
        inputPayload: { metadata: { title: "Other strings" } },
      })
      .returning();
    await db.insert(schema.reportingAnalyses).values({
      organizationId: organization.id,
      projectId: project.id,
      jobId: otherJob.id,
      step: "translation",
      segmentId: "z",
      sourceRevision: `rev_${randomUUID()}`,
      sourceLocale: "en-US",
      targetLocale: "de-DE",
      words: 50,
      bucket: "new",
      createdAt: IN_RANGE,
    });

    const rows = await queryWordVolume({
      organizationId: organization.id,
      projectIds: [project.id],
      from: "2026-08-01",
      to: "2026-08-31",
      groupBy: "project",
      jobId: job.id,
      targetLocale: "de-DE",
    });

    expect(rows).toEqual([
      expect.objectContaining({ targetLocale: "de-DE", analysedWords: 20, completedWords: 14 }),
    ]);
  });

  it("returns nothing outside the date range or the accessible projects", async () => {
    const { organization, project } = await seedJob();

    expect(
      await queryWordVolume({
        organizationId: organization.id,
        projectIds: [project.id],
        from: "2026-09-01",
        to: "2026-09-30",
        groupBy: "project",
      }),
    ).toEqual([]);
    expect(
      await queryWordVolume({
        organizationId: organization.id,
        projectIds: [],
        from: "2026-08-01",
        to: "2026-08-31",
        groupBy: "project",
      }),
    ).toEqual([]);
  });
});

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
