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

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database/client";

import { createReportingTestFixture } from "./reporting.fixture";
import { resolvePeriod } from "./report-period";
import { queryAutomatedTime, queryLoggedTime, queryLoggedTimeBySteps } from "./time-queries";

const fixture = createReportingTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

const period = resolvePeriod({
  from: "2026-06-08",
  to: "2026-06-14",
  today: "2026-10-21",
  startedDay: "2026-01-01",
});
const at = (day: string, time = "12:00:00") => new Date(`${day}T${time}Z`);

describe("time queries", () => {
  it("totals logged time by task, step and language, with people and the previous period", async () => {
    const workspace = await fixture.createWorkspace();
    const { organization, project, user, identity, createJob } = workspace;
    const { user: colleague } = await fixture.createLocalWorkosIdentity(
      fixture.createWorkosIdentityForOrganization(identity.organization, "translator"),
    );
    const release = await createJob({ title: "Release strings" });
    const help = await createJob({ title: "Help articles" });
    const entry = (
      jobId: string,
      contributorId: string,
      minutes: number,
      day: string,
      extra: Partial<typeof schema.reportingTimeEntries.$inferInsert> = {},
    ) => ({
      organizationId: organization.id,
      projectId: project.id,
      jobId,
      contributorId,
      step: "translation" as const,
      targetLocale: "fr-FR",
      workDate: at(day, "00:00:00"),
      minutes,
      ...extra,
    });
    await db
      .insert(schema.reportingTimeEntries)
      .values([
        entry(release.id, user.id, 60, "2026-06-08"),
        entry(release.id, colleague.id, 30, "2026-06-14"),
        entry(release.id, user.id, 45, "2026-06-09", { step: "review" }),
        entry(help.id, user.id, 20, "2026-06-10", { targetLocale: "de-DE" }),
        entry(help.id, user.id, 500, "2026-06-10", { voided: true }),
        entry(help.id, user.id, 15, "2026-06-01"),
      ]);
    const scope = { organizationId: organization.id, projectIds: [project.id], period };

    const time = await queryLoggedTime({ ...scope, page: 1 });
    expect(time.rows).toEqual([
      {
        jobId: release.id,
        jobTitle: "Release strings",
        projectId: project.id,
        step: "translation",
        targetLocale: "fr-FR",
        minutes: 90,
        people: 2,
      },
      expect.objectContaining({ jobId: release.id, step: "review", minutes: 45, people: 1 }),
      expect.objectContaining({ jobId: help.id, targetLocale: "de-DE", minutes: 20 }),
    ]);
    expect(time).toMatchObject({
      rowCount: 3,
      totals: { minutes: 155, people: 2, tasks: 2 },
      previousMinutes: 15,
    });
    await expect(
      queryLoggedTime({ ...scope, page: 1, targetLocale: "de-DE" }),
    ).resolves.toMatchObject({ totals: { minutes: 20, people: 1, tasks: 1 } });
    await expect(queryLoggedTimeBySteps(scope)).resolves.toEqual([
      { step: "translation", minutes: 110, people: 2 },
      { step: "review", minutes: 45, people: 1 },
    ]);
  });

  it("measures automated work that finished in the period, leaving out test runs", async () => {
    const workspace = await fixture.createWorkspace();
    const { organization, project, createJob } = workspace;
    const workflow = async (projectId: string | null) => {
      const [created] = await db
        .insert(schema.visualWorkflows)
        .values({ organizationId: organization.id, projectId, name: "Publish" })
        .returning();
      return created!;
    };
    const inProject = await workflow(project.id);
    const workspaceWide = await workflow(null);
    const run = async (visualWorkflowId: string, mode = "live") => {
      const [created] = await db
        .insert(schema.visualWorkflowRuns)
        .values({
          organizationId: organization.id,
          visualWorkflowId,
          triggerSource: "manual",
          mode,
        })
        .returning();
      return created!;
    };
    const node = (runId: string, nodeType: string, seconds: number, day = "2026-06-10") => ({
      organizationId: organization.id,
      runId,
      nodeId: `${nodeType}-${seconds}`,
      nodeType,
      status: "succeeded" as const,
      startedAt: at(day, "10:00:00"),
      finishedAt: new Date(at(day, "10:00:00").getTime() + seconds * 1000),
    });
    const live = await run(inProject.id);
    const mock = await run(inProject.id, "mock");
    const other = await run(workspaceWide.id);
    await db.insert(schema.visualWorkflowNodeRuns).values([
      node(live.id, "action.http", 2),
      node(live.id, "action.http", 3),
      node(live.id, "action.notify_slack", 1),
      node(live.id, "action.http", 60, "2026-06-01"),
      node(mock.id, "action.http", 100),
      node(other.id, "action.http", 7),
      // A trigger has no run time.
      { ...node(live.id, "trigger.manual", 0), startedAt: null },
    ]);

    const job = await createJob({ status: "succeeded" });
    const event = (workflowRunId: string, type: string, time: string, day = "2026-06-10") => ({
      jobId: job.id,
      organizationId: organization.id,
      workflowRunId,
      type: type as typeof schema.jobEvents.$inferInsert.type,
      createdAt: at(day, time),
    });
    await db.insert(schema.jobEvents).values([
      // A first run that failed before the period, then a retry that took ten minutes.
      event("run-1", "job_started", "09:00:00", "2026-06-01"),
      event("run-1", "job_failed", "09:05:00", "2026-06-01"),
      event("run-2", "job_started", "23:55:00", "2026-06-09"),
      event("run-2", "strings_extracted", "23:58:00", "2026-06-09"),
      event("run-2", "job_succeeded", "00:05:00"),
    ]);
    await db
      .update(schema.jobs)
      .set({ completedAt: at("2026-06-10", "00:05:00") })
      .where(eq(schema.jobs.id, job.id));

    const scope = { organizationId: organization.id, projectIds: [project.id], period };
    const time = await queryAutomatedTime({ ...scope, includeUnattributed: false });
    expect(time).toEqual({
      workflowSteps: [
        { nodeType: "action.http", milliseconds: 5000, runs: 2 },
        { nodeType: "action.notify_slack", milliseconds: 1000, runs: 1 },
      ],
      taskRuns: { milliseconds: 600_000, runs: 1 },
    });
    const withWorkspace = await queryAutomatedTime({ ...scope, includeUnattributed: true });
    expect(withWorkspace.workflowSteps[0]).toEqual({
      nodeType: "action.http",
      milliseconds: 12_000,
      runs: 3,
    });
  });
});
