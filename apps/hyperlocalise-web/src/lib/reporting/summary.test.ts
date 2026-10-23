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

import { and, eq, sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";

import { recordAnalysis, recordCompletions } from "./capture";
import {
  ensureSummaryBuilt,
  markSummaryDays,
  refreshPendingSummary,
  refreshSummaryDay,
  SUMMARY_VERSION,
} from "./summary";

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

const UNITS = ["words", "strings", "characters", "characters_with_spaces"];
const MEASURES = [
  ...UNITS.map((unit) => `source_${unit}`),
  ...UNITS.map((unit) => `arrived_${unit}`),
  "arrived_uncounted",
  ...UNITS.map((unit) => `arrived_done_${unit}`),
  ...UNITS.map((unit) => `finished_${unit}`),
  ...UNITS.map((unit) => `finished_by_person_${unit}`),
  ...UNITS.map((unit) => `finished_unchanged_${unit}`),
];
const KEY = "project_id, job_id, source_locale, target_locale, step, bucket, source, payable, day";
const SUMS = MEASURES.map((measure) => `sum(${measure})::integer as ${measure}`).join(", ");

function unitValues(row: string) {
  return {
    words: `coalesce(${row}.words, 0)`,
    strings: "1",
    characters: `coalesce(${row}.characters, 0)`,
    characters_with_spaces: `coalesce(${row}.characters_with_spaces, 0)`,
  } as Record<string, string>;
}

/** The summary rows, totalled by key, as the recount totals them. */
async function summaryRows(organizationId: string) {
  const result = await db.execute(sql`
    select ${sql.raw(KEY)}, ${sql.raw(SUMS)} from (
      select project_id, job_id, source_locale, target_locale, step, bucket, source, payable,
        day::text, ${sql.raw(MEASURES.join(", "))}
      from reporting_daily_by_task where organization_id = ${organizationId}
    ) rows group by ${sql.raw(KEY)} order by ${sql.raw(KEY)}
  `);
  return result.rows;
}

/**
 * What the summary should hold, recounted from every raw row in one query and written
 * differently from the refresh (a window function picks each text's earliest analysis).
 */
async function recountedRows(organizationId: string) {
  const arrival = unitValues("a");
  const finished = unitValues("f");
  const arrivalMeasures = MEASURES.map((measure) => {
    const unit = UNITS.find((name) => measure.endsWith(`_${name}`)) ?? "";
    if (measure === "arrived_uncounted") return "case when a.words is null then 1 else 0 end";
    if (measure.startsWith("source_")) return `case when a.first then ${arrival[unit]} else 0 end`;
    if (measure.startsWith("arrived_done_"))
      return `case when a.done then ${arrival[unit]} else 0 end`;
    if (measure.startsWith("arrived_")) return arrival[unit];
    return "0";
  });
  const finishedMeasures = MEASURES.map((measure) => {
    const unit = UNITS.find((name) => measure.endsWith(`_${name}`)) ?? "";
    if (measure.startsWith("finished_by_person_"))
      return `case when f.by_person then ${finished[unit]} else 0 end`;
    if (measure.startsWith("finished_unchanged_"))
      return `case when f.unchanged then ${finished[unit]} else 0 end`;
    if (measure.startsWith("finished_")) return finished[unit];
    return "0";
  });
  const result = await db.execute(sql`
    with arrivals as (
      select a.*, (a.created_at at time zone 'UTC')::date::text as day,
        row_number() over (
          partition by a.job_id, a.segment_id, a.source_revision, a.step
          order by a.created_at, a.target_locale, a.id
        ) = 1 as first,
        exists (
          select 1 from reporting_activity d
          where d.kind = 'completion' and d.analysis_id = a.id and d.step = a.step
        ) as done
      from reporting_analyses a
      where a.organization_id = ${organizationId} and a.is_current and a.project_id is not null
    ), finishes as (
      select c.project_id, s.job_id, s.source_locale, c.target_locale, c.step, s.bucket, s.billable,
        coalesce(c.source, 'unknown') as source,
        (c.created_at at time zone 'UTC')::date::text as day, s.words, s.characters,
        s.characters_with_spaces, c.actor_user_id is not null as by_person,
        coalesce(c.unchanged, false) as unchanged
      from reporting_activity c join reporting_analyses s on s.id = c.analysis_id
      where c.organization_id = ${organizationId} and c.kind = 'completion' and c.project_id is not null
    )
    select ${sql.raw(KEY)}, ${sql.raw(SUMS)} from (
      select a.project_id, a.job_id, a.source_locale, a.target_locale, a.step, a.bucket,
        '' as source, a.billable as payable, a.day,
        ${sql.raw(arrivalMeasures.map((value, index) => `${value} as ${MEASURES[index]}`).join(", "))}
      from arrivals a
      union all
      select f.project_id, f.job_id, f.source_locale, f.target_locale, f.step, f.bucket,
        f.source, f.billable, f.day,
        ${sql.raw(finishedMeasures.map((value, index) => `${value} as ${MEASURES[index]}`).join(", "))}
      from finishes f
    ) facts group by ${sql.raw(KEY)} order by ${sql.raw(KEY)}
  `);
  return result.rows;
}

/** Refreshes what writes marked, then checks the summary against a full recount. */
async function expectSummaryMatchesRecount(organizationId: string, scanCompletionsAbove?: number) {
  await refreshPendingSummary({ organizationIds: [organizationId], scanCompletionsAbove });
  const queued = await db
    .select()
    .from(schema.reportingSummaryQueue)
    .where(eq(schema.reportingSummaryQueue.organizationId, organizationId));
  expect(queued).toEqual([]);
  expect(await summaryRows(organizationId)).toEqual(await recountedRows(organizationId));
  // The by-project table is the by-task one without the task, source language and payable split.
  const byProject = await db.execute(sql`
    select project_id, target_locale, step, bucket, day::text, ${sql.raw(SUMS)}
    from reporting_daily_by_project where organization_id = ${organizationId}
    group by 1, 2, 3, 4, 5 order by 1, 2, 3, 4, 5`);
  const fromTasks = await db.execute(sql`
    select project_id, target_locale, step, bucket, day::text, ${sql.raw(SUMS)}
    from reporting_daily_by_task where organization_id = ${organizationId}
    group by 1, 2, 3, 4, 5 order by 1, 2, 3, 4, 5`);
  expect(byProject.rows).toEqual(fromTasks.rows);
  // The current rows are the by-project arrivals summed over every day, with the project's
  // source language.
  const current = await db.execute(sql`
    select project_id, source_locale, target_locale, step, bucket,
      arrived_words, arrived_strings, arrived_done_words, arrived_done_strings, arrived_uncounted
    from reporting_current_by_project where organization_id = ${organizationId}
    order by 1, 2, 3, 4, 5`);
  const fromDays = await db.execute(sql`
    select s.project_id, coalesce(p.source_locale, 'en') as source_locale, s.target_locale,
      s.step, s.bucket, sum(s.arrived_words)::integer as arrived_words,
      sum(s.arrived_strings)::integer as arrived_strings,
      sum(s.arrived_done_words)::integer as arrived_done_words,
      sum(s.arrived_done_strings)::integer as arrived_done_strings,
      sum(s.arrived_uncounted)::integer as arrived_uncounted
    from reporting_daily_by_project s join projects p on p.id = s.project_id
    where s.organization_id = ${organizationId}
    group by 1, 2, 3, 4, 5 having sum(s.arrived_strings) > 0 or sum(s.arrived_uncounted) > 0
    order by 1, 2, 3, 4, 5`);
  expect(current.rows).toEqual(fromDays.rows);
}

const day = (date: string) => new Date(`${date}T10:00:00Z`);

async function createWorkspace() {
  const { organization, project, user } = await projectFixture.createStoredProjectFixture();
  const save = (input: {
    segment: string;
    text: string;
    locale: string;
    on?: string;
    jobId?: string;
    projectId?: string;
    step?: "translation" | "review";
    billable?: boolean;
  }) =>
    recordAnalysis({
      organizationId: organization.id,
      projectId: input.projectId ?? project.id,
      jobId: input.jobId,
      sourceLocale: "en",
      targetLocale: input.locale,
      sourceEntries: { [input.segment]: input.text },
      step: input.step,
      billable: input.billable,
      occurredAt: input.on ? { [input.segment]: day(input.on) } : undefined,
    });
  const finish = (input: {
    segment: string;
    text: string;
    locale: string;
    on?: string;
    jobId?: string;
    step?: "translation" | "review";
    byPerson?: boolean;
  }) =>
    recordCompletions({
      organizationId: organization.id,
      jobId: input.jobId,
      targetLocale: input.locale,
      sourceEntries: { [input.segment]: input.text },
      step: input.step,
      provenance: input.byPerson ? "human" : "automated",
      actorUserId: input.byPerson ? user.id : null,
      occurredAt: input.on ? { [input.segment]: day(input.on) } : undefined,
    });
  const createJob = async (projectId = project.id) => {
    const [job] = await db
      .insert(schema.jobs)
      .values({
        id: `job_${randomUUID()}`,
        organizationId: organization.id,
        projectId,
        createdByUserId: user.id,
        kind: "translation",
        status: "running",
        workflowRunId: `run_${randomUUID()}`,
        inputPayload: {},
      })
      .returning();
    return job!;
  };
  return { organization, project, user, save, finish, createJob };
}

describe("reporting daily summary", () => {
  // Completions are found by key for an ordinary day and by scanning the project for a big one.
  it.each([
    ["looking completions up by key", undefined],
    ["scanning the project's completions", 0],
  ])(
    "stays equal to a full recount through saves, finishes, edits and deletions, %s",
    async (_, scanCompletionsAbove) => {
      const { organization, project, save, finish, createJob } = await createWorkspace();
      const check = () => expectSummaryMatchesRecount(organization.id, scanCompletionsAbove);

      await save({ segment: "s1", text: "Hello world", locale: "fr-FR", on: "2026-06-01" });
      await check();
      await save({ segment: "s1", text: "Hello world", locale: "de-DE", on: "2026-06-02" });
      await check();
      await save({
        segment: "s2",
        text: "Good morning, everyone",
        locale: "fr-FR",
        on: "2026-06-02",
        billable: true,
      });
      await check();

      // Finishing a string marks the day it was finished and the day it arrived.
      await finish({ segment: "s1", text: "Hello world", locale: "fr-FR", on: "2026-06-02" });
      await check();
      await finish({
        segment: "s2",
        text: "Good morning, everyone",
        locale: "fr-FR",
        on: "2026-06-03",
        byPerson: true,
      });
      await check();

      // A person post-edits a string already finished automatically: the earlier day moves the
      // words from automatic to people.
      await finish({
        segment: "s1",
        text: "Hello world",
        locale: "fr-FR",
        on: "2026-06-04",
        byPerson: true,
      });
      await check();

      // An edit: the old French version stops being current; its German copy now holds the
      // source count of the old text.
      await save({ segment: "s1", text: "Hello there, world", locale: "fr-FR", on: "2026-06-05" });
      await check();

      // A save dated before an existing copy of the same text takes over its source count.
      await save({ segment: "s3", text: "Welcome", locale: "ja-JP", on: "2026-06-03" });
      await check();
      await save({ segment: "s3", text: "Welcome", locale: "fr-FR", on: "2026-06-01" });
      await check();

      // A re-save of the same text keeps its row and day.
      await save({
        segment: "s2",
        text: "Good morning, everyone",
        locale: "fr-FR",
        on: "2026-06-06",
        billable: true,
      });
      await check();

      // Review is counted separately from translation.
      await save({
        segment: "s2",
        text: "Good morning, everyone",
        locale: "fr-FR",
        on: "2026-06-06",
        step: "review",
      });
      await finish({
        segment: "s2",
        text: "Good morning, everyone",
        locale: "fr-FR",
        on: "2026-06-07",
        step: "review",
        byPerson: true,
      });
      await check();

      // Task work recorded at the time it happens, then the task is deleted.
      const job = await createJob();
      await save({ segment: "s4", text: "Release notes for 4.2", locale: "fr-FR", jobId: job.id });
      await check();
      await finish({
        segment: "s4",
        text: "Release notes for 4.2",
        locale: "fr-FR",
        jobId: job.id,
      });
      await check();
      await db.delete(schema.jobs).where(eq(schema.jobs.id, job.id));
      await check();

      // Going back to an earlier text makes that version current again.
      await save({ segment: "s1", text: "Hello world", locale: "fr-FR", on: "2026-06-08" });
      await check();

      // A string finished automatically and later re-saved as a person's paid work, with no new
      // completion: the day it was finished moves its words to payable.
      await save({ segment: "s6", text: "Thank you", locale: "fr-FR", on: "2026-06-02" });
      await finish({ segment: "s6", text: "Thank you", locale: "fr-FR", on: "2026-06-03" });
      await check();
      await save({
        segment: "s6",
        text: "Thank you",
        locale: "fr-FR",
        on: "2026-06-09",
        billable: true,
      });
      await check();

      // A string whose words cannot be counted (an ICU message that does not parse).
      await save({
        segment: "s5",
        text: "{count, plural, one {",
        locale: "fr-FR",
        on: "2026-06-08",
      });
      await check();

      const rows = await summaryRows(organization.id);
      expect(rows.length).toBeGreaterThan(8);
      expect(rows.every((row) => row.project_id === project.id)).toBe(true);
    },
  );

  it("removes a deleted project's rows with it", async () => {
    const { organization, project, save, finish } = await createWorkspace();
    await save({ segment: "s1", text: "Hello world", locale: "fr-FR", on: "2026-06-01" });
    await finish({ segment: "s1", text: "Hello world", locale: "fr-FR", on: "2026-06-02" });
    await expectSummaryMatchesRecount(organization.id);
    expect((await summaryRows(organization.id)).length).toBeGreaterThan(0);

    await db.delete(schema.projects).where(eq(schema.projects.id, project.id));
    expect(await summaryRows(organization.id)).toEqual([]);
    expect(await recountedRows(organization.id)).toEqual([]);
  });

  it("keeps a mark that a write adds while the day is being refreshed", async () => {
    const { organization, project, save } = await createWorkspace();
    await save({ segment: "s1", text: "Hello world", locale: "fr-FR", on: "2026-06-01" });
    const mark = { organizationId: organization.id, projectId: project.id, day: "2026-06-01" };

    let marked!: () => void;
    const markedPromise = new Promise<void>((resolve) => (marked = resolve));
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    // A write marks the day again and holds its transaction open while the refresh runs.
    const writer = db.transaction(async (tx) => {
      await markSummaryDays(tx, organization.id, [{ projectId: project.id, day: mark.day }]);
      marked();
      await released;
    });
    await markedPromise;
    const refresh = refreshSummaryDay(mark);
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    await writer;
    expect(await refresh).toBe("refreshed");

    const [queued] = await db
      .select()
      .from(schema.reportingSummaryQueue)
      .where(
        and(
          eq(schema.reportingSummaryQueue.organizationId, organization.id),
          eq(schema.reportingSummaryQueue.projectId, project.id),
        ),
      );
    expect(queued?.generation).toBe(2);
  });

  it("passes over a project another refresh is working on", async () => {
    const { organization, project, save } = await createWorkspace();
    await save({ segment: "s1", text: "Hello world", locale: "fr-FR", on: "2026-06-01" });
    const mark = { organizationId: organization.id, projectId: project.id, day: "2026-06-01" };
    const lockKey = `reporting-summary:${organization.id}:${project.id}`;

    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockedPromise = new Promise<void>((resolve) => (locked = resolve));
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      locked();
      await released;
    });
    await lockedPromise;
    expect(await refreshSummaryDay(mark)).toBe("busy");
    release();
    await holder;
    expect(await refreshSummaryDay(mark)).toBe("refreshed");
  });

  it("builds the whole summary once for a workspace that has none", async () => {
    const { organization, save, finish } = await createWorkspace();
    await save({ segment: "s1", text: "Hello world", locale: "fr-FR", on: "2026-06-01" });
    await save({ segment: "s2", text: "Good morning", locale: "fr-FR", on: "2026-06-03" });
    await finish({ segment: "s1", text: "Hello world", locale: "fr-FR", on: "2026-06-04" });
    // As if the summary had never been built: no rows, no marks.
    await db
      .delete(schema.reportingSummaryQueue)
      .where(eq(schema.reportingSummaryQueue.organizationId, organization.id));

    expect(await ensureSummaryBuilt({ organizationIds: [organization.id] })).toBe(1);
    await expectSummaryMatchesRecount(organization.id);
    const [workspace] = await db
      .select()
      .from(schema.reportingWorkspaces)
      .where(eq(schema.reportingWorkspaces.organizationId, organization.id));
    expect(workspace?.summaryVersion).toBe(SUMMARY_VERSION);
    expect(await ensureSummaryBuilt({ organizationIds: [organization.id] })).toBe(0);
  });

  it("deletes a task whose string also has a content editor analysis of the same text", async () => {
    const { organization, save, createJob } = await createWorkspace();
    const job = await createJob();
    await save({ segment: "s1", text: "Hello world", locale: "fr-FR", on: "2026-06-01" });
    await save({ segment: "s1", text: "Hello world", locale: "fr-FR", jobId: job.id });

    await db.delete(schema.jobs).where(eq(schema.jobs.id, job.id));
    await expectSummaryMatchesRecount(organization.id);
  });

  it("starts a workspace's reporting at its first record", async () => {
    const { organization, save } = await createWorkspace();
    await save({ segment: "s1", text: "Hello world", locale: "fr-FR", on: "2026-06-01" });
    const [workspace] = await db
      .select()
      .from(schema.reportingWorkspaces)
      .where(eq(schema.reportingWorkspaces.organizationId, organization.id));
    expect(workspace?.startedAt).toBeInstanceOf(Date);
  });
});
