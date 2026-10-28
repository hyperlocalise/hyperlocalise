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

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db } from "@/lib/database/client";

import { createReportingTestFixture } from "./reporting.fixture";
import { resolvePeriod } from "./report-period";
import {
  queryActivity,
  queryFinishedByLanguage,
  queryFinishedSeries,
  queryTaskWords,
  queryWordCounts,
  queryWordCountSeries,
  WORD_COUNT_PAGE_SIZE,
} from "./word-queries";

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

describe("word count queries", () => {
  it("reads a language's arrivals as its source words under a language filter", async () => {
    const { organization, project, addSummary } = await fixture.createWorkspace();
    // Six source words into two languages: source sits on the first language analysed only.
    await addSummary([
      { targetLocale: "fr-FR", day: "2026-06-10", source: 6, arrived: 6 },
      { targetLocale: "de-DE", day: "2026-06-10", arrived: 6 },
    ]);
    const scope = { organizationId: organization.id, projectIds: [project.id], period };
    expect((await queryActivity({ ...scope, unit: "words" })).current.source).toBe(6);
    expect(
      (await queryActivity({ ...scope, unit: "words", targetLocale: "de-DE" })).current.source,
    ).toBe(6);
  });

  it("groups word counts by week and project, with the weeks in order", async () => {
    const { organization, project, createProject, addSummary } = await fixture.createWorkspace();
    const other = await createProject("Other");
    await addSummary([
      { targetLocale: "fr-FR", day: "2026-06-09", arrived: 10 },
      { targetLocale: "fr-FR", day: "2026-06-11", arrived: 5 },
      { projectId: other.id, targetLocale: "fr-FR", day: "2026-06-13", arrived: 7 },
      { targetLocale: "fr-FR", day: "2026-06-03", arrived: 40 },
    ]);
    const counts = await queryWordCounts({
      organizationId: organization.id,
      projectIds: [project.id, other.id],
      period: resolvePeriod({
        from: "2026-06-01",
        to: "2026-06-14",
        today: "2026-10-21",
        startedDay: "2026-01-01",
      }),
      unit: "words",
      step: "translation",
      mode: "arrived",
      groupBy: "week",
      page: 1,
    });
    // Weeks start on Monday: 1 June and 8 June 2026; projects by name within a week.
    expect(counts.rows.map((row) => [row.week, row.projectName, row.total])).toEqual([
      ["2026-06-01", project.name, 40],
      ["2026-06-08", project.name, 15],
      ["2026-06-08", other.name, 7],
    ]);
    expect(counts.groupCount).toBe(2);
    expect(counts.total).toBe(62);
  });

  it("charts units per week by project, the largest five then Other, with empty weeks", async () => {
    const { organization, project, createProject, addSummary } = await fixture.createWorkspace();
    const names = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"];
    const others: Awaited<ReturnType<typeof createProject>>[] = [];
    for (const name of names) others.push(await createProject(name));
    const [alpha, beta, gamma, delta, epsilon, zeta] = others;
    const week1 = "2026-06-02";
    const week3 = "2026-06-17";
    await addSummary([
      { targetLocale: "fr-FR", day: week1, arrived: 40 },
      { projectId: alpha.id, targetLocale: "fr-FR", day: week1, arrived: 30 },
      { projectId: alpha.id, targetLocale: "de-DE", day: week3, arrived: 5 },
      { projectId: beta.id, targetLocale: "fr-FR", day: week3, arrived: 20, finished: 9 },
      { projectId: gamma.id, targetLocale: "fr-FR", day: week1, arrived: 10 },
      { projectId: delta.id, targetLocale: "fr-FR", day: week3, arrived: 8 },
      { projectId: epsilon.id, targetLocale: "fr-FR", day: week1, arrived: 3 },
      { projectId: zeta.id, targetLocale: "fr-FR", day: week3, arrived: 2 },
      // Outside the period.
      { projectId: zeta.id, targetLocale: "fr-FR", day: "2026-06-30", arrived: 500 },
    ]);
    const scope = {
      organizationId: organization.id,
      projectIds: [project.id, ...others.map((other) => other.id)],
      period: resolvePeriod({
        from: "2026-06-01",
        to: "2026-06-21",
        today: "2026-10-21",
        startedDay: "2026-01-01",
      }),
      unit: "words" as const,
      step: "translation" as const,
    };
    const weekly = { split: "project", per: "week" } as const;
    const arrived = await queryWordCountSeries({ ...scope, ...weekly, mode: "arrived" });
    expect(arrived.groups.map((group) => group.name ?? "Other")).toEqual([
      project.name,
      "Alpha",
      "Beta",
      "Gamma",
      "Delta",
      "Other",
    ]);
    expect(arrived.groups.at(-1)).toEqual({ key: null, name: null, other: true });
    // The middle week has nothing and is still a point; Other is Epsilon and Zeta together.
    expect(arrived.points).toEqual([
      { start: "2026-06-01", units: [40, 30, 0, 10, 0, 3] },
      { start: "2026-06-08", units: [0, 0, 0, 0, 0, 0] },
      { start: "2026-06-15", units: [0, 5, 20, 0, 8, 2] },
    ]);
    // Finished work is its own measure, with no Other when every project fits.
    const finished = await queryWordCountSeries({ ...scope, ...weekly, mode: "finished" });
    expect(finished.groups).toEqual([{ key: beta.id, name: "Beta", other: false }]);
    expect(finished.points.map((point) => point.units)).toEqual([[0], [0], [9]]);
    // A language filter narrows every project; a project with nothing left drops out.
    const german = await queryWordCountSeries({
      ...scope,
      ...weekly,
      mode: "arrived",
      targetLocale: "de-DE",
    });
    expect(german.groups.map((group) => group.name)).toEqual(["Alpha"]);
    expect(german.points.map((point) => point.units)).toEqual([[0], [0], [5]]);
  });

  it("charts units by language per day and per month, the largest five then Other", async () => {
    const { organization, project, addSummary } = await fixture.createWorkspace();
    const languages = ["da-DK", "de-DE", "es-ES", "fr-FR", "it-IT", "ja-JP", "nl-NL"];
    await addSummary(
      languages.map((targetLocale, index) => ({
        targetLocale,
        day: index % 2 ? "2026-06-09" : "2026-06-10",
        arrived: 70 - index * 10,
      })),
    );
    const scope = {
      organizationId: organization.id,
      projectIds: [project.id],
      period,
      unit: "words" as const,
      step: "translation" as const,
      mode: "arrived" as const,
      split: "language" as const,
    };
    const daily = await queryWordCountSeries({ ...scope, per: "day" });
    // Languages have no name of their own; Japanese and Dutch are the two smallest.
    expect(daily.groups.map((group) => group.key ?? "Other")).toEqual([
      "da-DK",
      "de-DE",
      "es-ES",
      "fr-FR",
      "it-IT",
      "Other",
    ]);
    expect(daily.groups.every((group) => group.name === null)).toBe(true);
    expect(daily.points.map((point) => point.start)).toEqual([
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14",
    ]);
    expect(daily.points[1].units).toEqual([0, 60, 0, 40, 0, 20]);
    expect(daily.points[2].units).toEqual([70, 0, 50, 0, 30, 10]);
    // A month starts on its first day, before the period here.
    const monthly = await queryWordCountSeries({ ...scope, per: "month" });
    expect(monthly.points).toEqual([{ start: "2026-06-01", units: [70, 60, 50, 40, 30, 30] }]);
  });

  it("charts match bands in tiers, closest first, with repetitions and unavailable work placed", async () => {
    const { organization, project, addSummary } = await fixture.createWorkspace();
    const day = "2026-06-10";
    await addSummary([
      { targetLocale: "fr-FR", day, bucket: "repetition", arrived: 4 },
      { targetLocale: "fr-FR", day, bucket: "100", arrived: 6 },
      { targetLocale: "fr-FR", day, bucket: "85-94", arrived: 3 },
      { targetLocale: "fr-FR", day, bucket: "75-84", arrived: 2 },
      { targetLocale: "fr-FR", day, bucket: "new", arrived: 20 },
      { targetLocale: "fr-FR", day, bucket: "unavailable", arrived: 1 },
    ]);
    const series = await queryWordCountSeries({
      organizationId: organization.id,
      projectIds: [project.id],
      period,
      unit: "words",
      step: "translation",
      mode: "arrived",
      split: "band",
      per: "week",
    });
    // No 95-99% or 50-74% work, so those tiers are left out; the order is fixed, not by size.
    expect(series.groups.map((group) => group.key)).toEqual(["exact", "fuzzy", "new"]);
    expect(series.points).toEqual([{ start: "2026-06-08", units: [10, 5, 21] }]);
  });

  it("charts and groups units by task step, with work outside any task apart", async () => {
    const { organization, project, createJob, addSummary } = await fixture.createWorkspace();
    const translate = await createJob({ kind: "translation" });
    const postEdit = await createJob({ taskStep: "edit" });
    const proofread = await createJob({ taskStep: "proofread" });
    const day = "2026-06-10";
    await addSummary([
      { jobId: translate.id, targetLocale: "fr-FR", day, arrived: 30 },
      { jobId: postEdit.id, targetLocale: "fr-FR", day, step: "review", arrived: 12 },
      { jobId: proofread.id, targetLocale: "de-DE", day, step: "review", arrived: 8 },
      { jobId: proofread.id, targetLocale: "fr-FR", day, step: "review", arrived: 5 },
      { jobId: null, targetLocale: "fr-FR", day, step: "review", arrived: 3 },
    ]);
    const scope = {
      organizationId: organization.id,
      projectIds: [project.id],
      period,
      unit: "words" as const,
      mode: "arrived" as const,
    };
    // Review work: post-edit and proofread tasks, and editor work outside any task.
    const series = await queryWordCountSeries({
      ...scope,
      step: "review",
      split: "task_step",
      per: "week",
    });
    expect(series.groups.map((group) => group.key)).toEqual(["post_edit", "proofread", "no_task"]);
    expect(series.points).toEqual([{ start: "2026-06-08", units: [12, 13, 3] }]);
    const counts = await queryWordCounts({
      ...scope,
      step: "review",
      groupBy: "task_step",
      page: 1,
    });
    expect(counts.rows.map((row) => [row.taskStep, row.targetLocale, row.total])).toEqual([
      ["post_edit", "fr-FR", 12],
      ["proofread", "de-DE", 8],
      ["proofread", "fr-FR", 5],
      ["no_task", "fr-FR", 3],
    ]);
    expect(counts.rows.every((row) => row.projectId === null)).toBe(true);
    expect(counts.groupCount).toBe(3);
    expect(counts.total).toBe(28);
    // Translation work is the translate task's alone.
    const translation = await queryWordCounts({
      ...scope,
      step: "translation",
      groupBy: "task_step",
      page: 1,
    });
    expect(translation.rows.map((row) => [row.taskStep, row.total])).toEqual([["translate", 30]]);
  });

  it("groups word counts by language across projects", async () => {
    const { organization, project, createProject, addSummary } = await fixture.createWorkspace();
    const other = await createProject("Other");
    await addSummary([
      { targetLocale: "fr-FR", day: "2026-06-09", bucket: "100", arrived: 10 },
      { projectId: other.id, targetLocale: "fr-FR", day: "2026-06-10", arrived: 5 },
      { projectId: other.id, targetLocale: "de-DE", day: "2026-06-10", arrived: 7 },
    ]);
    const counts = await queryWordCounts({
      organizationId: organization.id,
      projectIds: [project.id, other.id],
      period,
      unit: "words",
      step: "translation",
      mode: "arrived",
      groupBy: "language",
      page: 1,
    });
    expect(counts.rows.map((row) => [row.targetLocale, row.projectId, row.bands])).toEqual([
      ["de-DE", null, { new: 7 }],
      ["fr-FR", null, { "100": 10, new: 5 }],
    ]);
    expect(counts.groupCount).toBe(2);
    expect(counts.total).toBe(22);
  });

  it("totals a period and the one before it in one read", async () => {
    const { organization, project, addSummary } = await fixture.createWorkspace();
    await addSummary([
      // This period: 100 words arrive in French, 60 of them finished; 30 reviewed.
      // Of the 40 unfinished, 10 were in a task that was cancelled.
      {
        targetLocale: "fr-FR",
        day: "2026-06-10",
        source: 100,
        arrived: 100,
        arrivedDone: 60,
        abandoned: 10,
        uncounted: 2,
      },
      // 70 finished: 50 from the memory, 20 by a person who kept 15 as given.
      { targetLocale: "fr-FR", day: "2026-06-10", finished: 50, textSource: "memory" },
      {
        targetLocale: "fr-FR",
        day: "2026-06-10",
        finished: 20,
        finishedByPerson: 20,
        finishedUnchanged: 15,
        textSource: "person",
      },
      { targetLocale: "fr-FR", step: "review", day: "2026-06-11", arrived: 70, finished: 30 },
      // The previous period, and a day outside both.
      {
        targetLocale: "fr-FR",
        day: "2026-06-03",
        source: 40,
        arrived: 40,
        finished: 10,
        textSource: "unknown",
      },
      { targetLocale: "fr-FR", day: "2026-05-01", source: 999, arrived: 999 },
    ]);
    const scope = { organizationId: organization.id, projectIds: [project.id], period };

    await expect(queryActivity({ ...scope, unit: "words" })).resolves.toEqual({
      current: {
        source: 100,
        arrived: 100,
        arrivedDone: 60,
        abandoned: 10,
        finished: 70,
        reviewed: 30,
        uncounted: 2,
        finishedByPerson: 20,
        finishedUnchanged: 15,
        finishedBySource: { memory: 50, ai: 0, person: 20, import: 0, unknown: 0 },
      },
      previous: {
        source: 40,
        arrived: 40,
        arrivedDone: 0,
        abandoned: 0,
        finished: 10,
        reviewed: 0,
        uncounted: 0,
        finishedByPerson: 0,
        finishedUnchanged: 0,
        finishedBySource: { memory: 0, ai: 0, person: 0, import: 0, unknown: 10 },
      },
    });
    // A project the viewer cannot open is never read, even when chosen.
    await expect(
      queryActivity({ ...scope, projectIds: [], projectId: project.id, unit: "words" }),
    ).resolves.toMatchObject({ current: { arrived: 0 } });
  });

  it("splits finished work into people and automatic, by day and by week", async () => {
    const { organization, project, addSummary } = await fixture.createWorkspace();
    await addSummary([
      { targetLocale: "fr-FR", day: "2026-06-09", finished: 30, textSource: "ai" },
      {
        targetLocale: "fr-FR",
        day: "2026-06-09",
        finished: 20,
        finishedByPerson: 20,
        finishedUnchanged: 5,
        textSource: "person",
      },
      { targetLocale: "de-DE", day: "2026-06-09", finished: 10, textSource: "memory" },
      {
        targetLocale: "de-DE",
        day: "2026-06-13",
        finished: 5,
        finishedByPerson: 5,
        textSource: "person",
      },
      { targetLocale: "de-DE", step: "review", day: "2026-06-13", finished: 99 },
    ]);
    const scope = {
      organizationId: organization.id,
      projectIds: [project.id],
      unit: "words" as const,
      step: "translation" as const,
    };

    const daily = await queryFinishedSeries({ ...scope, period });
    expect(daily).toHaveLength(7);
    const none = { memory: 0, ai: 0, person: 0, import: 0, unknown: 0 };
    expect(daily.find((point) => point.start === "2026-06-09")).toEqual({
      start: "2026-06-09",
      ...none,
      memory: 10,
      ai: 30,
      person: 20,
    });
    expect(daily.find((point) => point.start === "2026-06-10")).toEqual({
      start: "2026-06-10",
      ...none,
    });

    const weekly = await queryFinishedSeries({
      ...scope,
      period: { ...period, from: "2026-06-03", interval: "week" },
    });
    // Weeks start on Monday: 1 June and 8 June.
    expect(weekly).toEqual([
      { start: "2026-06-01", ...none },
      { start: "2026-06-08", ...none, memory: 10, ai: 30, person: 25 },
    ]);

    await expect(queryFinishedByLanguage({ ...scope, period })).resolves.toEqual([
      { targetLocale: "fr-FR", units: 50 },
      { targetLocale: "de-DE", units: 15 },
    ]);
  });

  it("counts by project and language, with match bands as columns, in any unit", async () => {
    const { organization, project, createProject, addSummary } = await fixture.createWorkspace();
    const help = await createProject("Help centre");
    await addSummary([
      {
        targetLocale: "ja-JP",
        bucket: "new",
        day: "2026-06-10",
        arrived: { words: 12, strings: 2, characters: 40, characters_with_spaces: 44 },
      },
      {
        targetLocale: "ja-JP",
        bucket: "100",
        day: "2026-06-12",
        arrived: { words: 8, strings: 1, characters: 30, characters_with_spaces: 33 },
      },
      { projectId: help.id, targetLocale: "fr-FR", day: "2026-06-11", arrived: 5, uncounted: 1 },
    ]);
    const input = {
      organizationId: organization.id,
      projectIds: [project.id, help.id],
      period,
      step: "translation" as const,
      mode: "arrived" as const,
      groupBy: "project" as const,
      page: 1,
    };

    const characters = await queryWordCounts({ ...input, unit: "characters" });
    expect(characters.rows).toEqual([
      {
        week: null,
        projectId: project.id,
        projectName: "Docs",
        jobId: null,
        jobTitle: null,
        taskStep: null,
        targetLocale: "ja-JP",
        bands: { new: 40, "100": 30 },
        total: 70,
      },
    ]);
    expect(characters).toMatchObject({ bandTotals: { new: 40, "100": 30 }, total: 70 });

    const words = await queryWordCounts({ ...input, unit: "words" });
    expect(words.rows.map((row) => [row.projectName, row.total])).toEqual([
      ["Docs", 20],
      ["Help centre", 5],
    ]);
    expect(words).toMatchObject({ total: 25, uncounted: 1, groupCount: 2 });
  });

  it("pages tasks largest first and keeps totals across every page", async () => {
    const { organization, project, createJob, addSummary } = await fixture.createWorkspace();
    const jobs = [];
    for (let index = 0; index < WORD_COUNT_PAGE_SIZE + 2; index += 1)
      jobs.push(await createJob({ title: `Task ${index}` }));
    await addSummary([
      ...jobs.map((job, index) => ({
        jobId: job.id,
        targetLocale: "fr-FR",
        day: "2026-06-10",
        finished: index + 1,
      })),
      // Saved in the content editor outside any task.
      { jobId: null, targetLocale: "fr-FR", day: "2026-06-10", finished: 1000 },
    ]);
    const input = {
      organizationId: organization.id,
      projectIds: [project.id],
      period,
      unit: "words" as const,
      step: "translation" as const,
      mode: "finished" as const,
      groupBy: "task" as const,
    };
    const first = await queryWordCounts({ ...input, page: 1 });
    expect(first.rows).toHaveLength(WORD_COUNT_PAGE_SIZE);
    expect(first.rows[0]).toMatchObject({ jobId: null, jobTitle: null, total: 1000 });
    expect(first.rows[1]).toMatchObject({ jobTitle: `Task ${WORD_COUNT_PAGE_SIZE + 1}` });
    const allWords = 1000 + ((WORD_COUNT_PAGE_SIZE + 2) * (WORD_COUNT_PAGE_SIZE + 3)) / 2;
    expect(first).toMatchObject({ groupCount: WORD_COUNT_PAGE_SIZE + 3, total: allWords });

    const second = await queryWordCounts({ ...input, page: 2 });
    expect(second.rows.map((row) => row.jobTitle)).toEqual(["Task 2", "Task 1", "Task 0"]);
    expect(second.total).toBe(allWords);

    const everything = await queryWordCounts({ ...input, page: 1, all: true });
    expect(everything.rows).toHaveLength(WORD_COUNT_PAGE_SIZE + 3);

    // One task chosen: only its rows.
    const one = await queryWordCounts({ ...input, page: 1, jobIds: [jobs[0].id] });
    expect(one.rows).toEqual([expect.objectContaining({ jobId: jobs[0].id, total: 1 })]);
  });

  it("reads a task's words over its whole life", async () => {
    const { organization, createJob, addSummary } = await fixture.createWorkspace();
    const job = await createJob();
    await addSummary([
      {
        jobId: job.id,
        targetLocale: "fr-FR",
        bucket: "new",
        day: "2026-01-10",
        source: 10,
        arrived: 10,
        arrivedDone: 10,
      },
      {
        jobId: job.id,
        targetLocale: "de-DE",
        bucket: "new",
        day: "2026-01-10",
        arrived: 10,
        arrivedDone: 4,
      },
      {
        jobId: job.id,
        targetLocale: "de-DE",
        bucket: "95-99",
        day: "2026-03-02",
        source: 3,
        arrived: 3,
      },
      {
        jobId: job.id,
        targetLocale: "fr-FR",
        step: "review",
        day: "2026-03-02",
        arrived: 10,
        arrivedDone: 6,
      },
    ]);
    const words = await queryTaskWords({
      organizationId: organization.id,
      jobId: job.id,
      unit: "words",
    });
    expect(words.totals.translation).toEqual({
      source: 13,
      arrived: 23,
      arrivedDone: 14,
      uncounted: 0,
    });
    expect(words.totals.review).toMatchObject({ arrived: 10, arrivedDone: 6 });
    expect(words.rows).toEqual([
      {
        targetLocale: "de-DE",
        step: "translation",
        bands: { new: 10, "95-99": 3 },
        total: 13,
        finished: 4,
      },
      { targetLocale: "fr-FR", step: "translation", bands: { new: 10 }, total: 10, finished: 10 },
      { targetLocale: "fr-FR", step: "review", bands: { new: 10 }, total: 10, finished: 6 },
    ]);
  });
});
