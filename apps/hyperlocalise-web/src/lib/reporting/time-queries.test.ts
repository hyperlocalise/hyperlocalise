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
    // A post-edit task from a visual workflow, and a proofread task made in the app.
    const help = await createJob({ title: "Help articles", taskStep: "edit" });
    const legal = await createJob({ title: "Legal pages", kind: "proofread" });
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
        entry(legal.id, colleague.id, 10, "2026-06-12", { step: "review" }),
      ]);
    const scope = { organizationId: organization.id, projectIds: [project.id], period };

    const time = await queryLoggedTime({ ...scope, page: 1 });
    expect(time.rows).toEqual([
      {
        jobId: release.id,
        jobTitle: "Release strings",
        projectId: project.id,
        taskStep: "translate",
        step: "translation",
        targetLocale: "fr-FR",
        minutes: 90,
        people: 2,
      },
      expect.objectContaining({ jobId: release.id, step: "review", minutes: 45, people: 1 }),
      expect.objectContaining({
        jobId: help.id,
        taskStep: "post_edit",
        targetLocale: "de-DE",
        minutes: 20,
      }),
      expect.objectContaining({ jobId: legal.id, taskStep: "proofread", minutes: 10 }),
    ]);
    expect(time).toMatchObject({
      rowCount: 4,
      totals: { minutes: 165, people: 2, tasks: 3 },
      previousMinutes: 15,
    });
    await expect(
      queryLoggedTime({ ...scope, page: 1, targetLocale: "de-DE" }),
    ).resolves.toMatchObject({ totals: { minutes: 20, people: 1, tasks: 1 } });
    // By what each task is for: the review-step entry on the translate task is translate work.
    await expect(queryLoggedTimeBySteps(scope)).resolves.toEqual([
      { taskStep: "translate", minutes: 135, people: 2 },
      { taskStep: "post_edit", minutes: 20, people: 1 },
      { taskStep: "proofread", minutes: 10, people: 1 },
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
    const staged = await createJob({ status: "succeeded" });
    const event = (
      workflowRunId: string,
      type: string,
      time: string,
      day = "2026-06-10",
      extra: Partial<typeof schema.jobEvents.$inferInsert> = {},
    ) => ({
      jobId: job.id,
      organizationId: organization.id,
      workflowRunId,
      type: type as typeof schema.jobEvents.$inferInsert.type,
      createdAt: at(day, time),
      ...extra,
    });
    const stagedEvent = (type: string, time: string, locale?: string) =>
      event("run-3", type, time, "2026-06-10", { jobId: staged.id, locale: locale ?? null });
    await db.insert(schema.jobEvents).values([
      // A first run that failed before the period, then a retry that took ten minutes and
      // recorded no stage boundaries but one.
      event("run-1", "job_started", "09:00:00", "2026-06-01"),
      event("run-1", "job_failed", "09:05:00", "2026-06-01"),
      event("run-2", "job_started", "23:55:00", "2026-06-09"),
      event("run-2", "strings_extracted", "23:58:00", "2026-06-09"),
      event("run-2", "job_succeeded", "00:05:00"),
      // A run with every stage: 30 s preparing, 30 s extracting, 20 s reusing the memory,
      // then two languages side by side until 10:04:00, and 30 s finishing.
      stagedEvent("job_started", "10:00:00"),
      stagedEvent("context_ready", "10:00:30"),
      stagedEvent("strings_extracted", "10:01:00"),
      stagedEvent("translations_reused", "10:01:10", "fr-FR"),
      stagedEvent("translations_reused", "10:01:20", "de-DE"),
      stagedEvent("locale_progress", "10:02:00", "fr-FR"),
      stagedEvent("locale_completed", "10:03:00", "de-DE"),
      stagedEvent("locale_completed", "10:04:00", "fr-FR"),
      stagedEvent("job_succeeded", "10:04:30"),
    ]);
    await db
      .update(schema.jobs)
      .set({ completedAt: at("2026-06-10", "00:05:00") })
      .where(eq(schema.jobs.id, job.id));
    await db
      .update(schema.jobs)
      .set({ completedAt: at("2026-06-10", "10:04:30") })
      .where(eq(schema.jobs.id, staged.id));

    const scope = { organizationId: organization.id, projectIds: [project.id], period };
    const time = await queryAutomatedTime({ ...scope, includeUnattributed: false });
    expect(time).toEqual({
      workflowSteps: [
        { nodeType: "action.http", milliseconds: 5000, runs: 2 },
        { nodeType: "action.notify_slack", milliseconds: 1000, runs: 1 },
      ],
      taskRuns: {
        milliseconds: 870_000,
        runs: 2,
        // The run without boundaries puts its ten minutes in "other".
        stages: [
          { stage: "preparing", milliseconds: 30_000 },
          { stage: "extracting", milliseconds: 30_000 },
          { stage: "reusing_memory", milliseconds: 20_000 },
          { stage: "translating", milliseconds: 160_000 },
          { stage: "finishing", milliseconds: 30_000 },
          { stage: "other", milliseconds: 600_000 },
        ],
      },
    });
    // With a language chosen: runs that had it, memory reuse and translating for it alone.
    const german = await queryAutomatedTime({
      ...scope,
      targetLocale: "de-DE",
      includeUnattributed: false,
    });
    expect(german.taskRuns).toEqual({
      milliseconds: 270_000,
      runs: 1,
      stages: [
        { stage: "preparing", milliseconds: 30_000 },
        { stage: "extracting", milliseconds: 30_000 },
        { stage: "reusing_memory", milliseconds: 20_000 },
        { stage: "translating", milliseconds: 100_000 },
        { stage: "finishing", milliseconds: 30_000 },
        { stage: "other", milliseconds: 0 },
      ],
    });
    const withWorkspace = await queryAutomatedTime({ ...scope, includeUnattributed: true });
    expect(withWorkspace.workflowSteps[0]).toEqual({
      nodeType: "action.http",
      milliseconds: 12_000,
      runs: 3,
    });
  });
});
