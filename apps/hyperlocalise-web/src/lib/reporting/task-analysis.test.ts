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
import { insertStoredSourceFile } from "@/api/routes/public-jobs/public-jobs.fixture";
import { db, schema } from "@/lib/database/client";
import { ensureRepositorySourceFile } from "@/lib/file-storage/records";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";

import { markSummaryDays, refreshPendingSummary } from "./summary";
import {
  analyseTaskLanguage,
  analyseTaskStrings,
  openPersonTaskForString,
  personTaskAt,
  personTaskForSave,
  refreshTaskDays,
} from "./task-analysis";
import { readTaskAnalysis, setTaskAnalysisStatus } from "./task-analysis-status";
import { queryTaskWords } from "./word-queries";

vi.mock("@/lib/flags/workspace-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workspace-flags")>();
  return { ...actual, resolveWorkspaceReportsFlag: vi.fn(async () => true) };
});

const projectFixture = createProjectTestFixture();
const SOURCE_PATH = "locales/en.json";

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

/** A project with one file of two visible strings and one hidden one, and a version of the file. */
async function createFileWithStrings() {
  const { organization, project, user } = await projectFixture.createStoredProjectFixture();
  const sourceFile = await ensureRepositorySourceFile({
    organizationId: organization.id,
    projectId: project.id,
    sourcePath: SOURCE_PATH,
  });
  await upsertProjectTranslationKeysFromEntries({
    organizationId: organization.id,
    projectId: project.id,
    repositorySourceFileId: sourceFile.id,
    entries: [
      { key: "greeting", text: "Hello world", context: null },
      { key: "farewell", text: "Goodbye for now", context: null },
      { key: "hidden", text: "Not shown", context: null },
    ],
  });
  await db
    .update(schema.projectTranslationKeys)
    .set({ isHidden: true })
    .where(
      and(
        eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id),
        eq(schema.projectTranslationKeys.key, "hidden"),
      ),
    );
  const storedFile = await insertStoredSourceFile({
    organizationId: organization.id,
    projectId: project.id,
    filename: "en.json",
    contentType: "application/json",
    sourceKind: "repository_file",
    metadata: { sourcePath: SOURCE_PATH },
  });
  const [version] = await db
    .insert(schema.repositorySourceFileVersions)
    .values({
      repositorySourceFileId: sourceFile.id,
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: SOURCE_PATH,
      storedFileId: storedFile.id,
    })
    .returning();
  const createPersonTask = async (input: {
    kind: "translation" | "proofread";
    targetLocales?: string[];
    createdAt?: Date;
  }) => {
    const [job] = await db
      .insert(schema.jobs)
      .values({
        id: `job_${randomUUID()}`,
        organizationId: organization.id,
        projectId: project.id,
        createdByUserId: user.id,
        kind: input.kind,
        status: "waiting_for_review",
        inputPayload: {
          sourceLocale: "en-US",
          targetLocales: input.targetLocales ?? ["fr-FR"],
          metadata: { title: `${input.kind} task` },
        },
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      })
      .returning();
    await db
      .insert(schema.translationJobDetails)
      .values({ jobId: job!.id, type: "file", sourceFileVersionId: version!.id });
    return job!;
  };
  return { organization, project, sourceFile, createPersonTask };
}

describe("analyseTaskStrings", () => {
  it("records a task's visible strings as arrived for each language, once", async () => {
    const { organization, project, sourceFile, createPersonTask } = await createFileWithStrings();
    const task = await createPersonTask({ kind: "proofread", targetLocales: ["fr-FR", "de-DE"] });
    const input = {
      organizationId: organization.id,
      projectId: project.id,
      jobId: task.id,
      step: "review" as const,
      sourceLocale: "en-US",
      targetLocales: ["fr-FR", "de-DE"],
      repositorySourceFileId: sourceFile.id,
    };
    const today = new Date().toISOString().slice(0, 10);
    expect(await analyseTaskStrings(input)).toEqual({ strings: 2, days: [today] });
    // Running again, as a retried step would, adds nothing.
    expect((await analyseTaskStrings(input)).strings).toBe(2);

    const analyses = await db
      .select()
      .from(schema.reportingAnalyses)
      .where(eq(schema.reportingAnalyses.jobId, task.id));
    expect(analyses).toHaveLength(4);
    expect(analyses.every((row) => row.step === "review" && row.billable && row.isCurrent)).toBe(
      true,
    );
    expect(new Set(analyses.map((row) => row.targetLocale))).toEqual(new Set(["fr-FR", "de-DE"]));
    expect(analyses.map((row) => row.words).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
      2, 2, 3, 3,
    ]);
  });

  it("shows the task's strings in its report once its days are refreshed, before any scheduled run", async () => {
    const { organization, project, sourceFile, createPersonTask } = await createFileWithStrings();
    const task = await createPersonTask({ kind: "proofread" });
    const { days } = await analyseTaskStrings({
      organizationId: organization.id,
      projectId: project.id,
      jobId: task.id,
      step: "review",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      repositorySourceFileId: sourceFile.id,
    });
    const words = () =>
      queryTaskWords({ organizationId: organization.id, jobId: task.id, unit: "words" });
    // Recorded, but the summary the report reads does not have it yet.
    expect((await words()).totals.review.arrived).toBe(0);

    await refreshTaskDays({ organizationId: organization.id, projectId: project.id, days });
    expect((await words()).totals.review.arrived).toBe(5);
    // The task's refresh leaves the project's current rows, and the days' marks, to the
    // scheduled run, which then rewrites both.
    const current = () =>
      db
        .select({ strings: schema.reportingCurrentByProject.arrivedStrings })
        .from(schema.reportingCurrentByProject)
        .where(eq(schema.reportingCurrentByProject.projectId, project.id));
    expect(await current()).toEqual([]);
    const marks = await db
      .select({ day: schema.reportingSummaryQueue.day })
      .from(schema.reportingSummaryQueue)
      .where(eq(schema.reportingSummaryQueue.projectId, project.id));
    expect(marks.map((mark) => mark.day)).toEqual(days);
    await refreshPendingSummary({ organizationIds: [organization.id] });
    expect(await current()).toEqual([{ strings: 2 }]);
  });

  it("waits a few seconds for a scheduled run that holds the project, then refreshes", async () => {
    const { organization, project, sourceFile, createPersonTask } = await createFileWithStrings();
    const task = await createPersonTask({ kind: "proofread" });
    const { days } = await analyseTaskStrings({
      organizationId: organization.id,
      projectId: project.id,
      jobId: task.id,
      step: "review",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      repositorySourceFileId: sourceFile.id,
    });
    const lockKey = `reporting-summary:${organization.id}:${project.id}`;
    let locked!: () => void;
    const lockedPromise = new Promise<void>((resolve) => (locked = resolve));
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      locked();
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    await lockedPromise;
    await refreshTaskDays({ organizationId: organization.id, projectId: project.id, days });
    await holder;
    const words = await queryTaskWords({
      organizationId: organization.id,
      jobId: task.id,
      unit: "words",
    });
    expect(words.totals.review.arrived).toBe(5);
  });

  it("refreshes only the days still marked, so a run that did them meanwhile is not repeated", async () => {
    const { organization, project, sourceFile, createPersonTask } = await createFileWithStrings();
    const task = await createPersonTask({ kind: "proofread" });
    const { days } = await analyseTaskStrings({
      organizationId: organization.id,
      projectId: project.id,
      jobId: task.id,
      step: "review",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      repositorySourceFileId: sourceFile.id,
    });
    // A scheduled run refreshed the day already and cleared its mark.
    await db
      .delete(schema.reportingSummaryQueue)
      .where(eq(schema.reportingSummaryQueue.organizationId, organization.id));
    await refreshTaskDays({ organizationId: organization.id, projectId: project.id, days });
    const words = () =>
      queryTaskWords({ organizationId: organization.id, jobId: task.id, unit: "words" });
    // Nothing was written, as the refresh found no day to do.
    expect((await words()).totals.review.arrived).toBe(0);
    // A day marked again is refreshed.
    await db.transaction((tx) =>
      markSummaryDays(tx, organization.id, [{ projectId: project.id, day: days[0] }]),
    );
    await refreshTaskDays({ organizationId: organization.id, projectId: project.id, days });
    expect((await words()).totals.review.arrived).toBe(5);
  });
});

describe("analyseTaskLanguage", () => {
  it("notes its progress on the task's analysis, and records without bands when asked", async () => {
    const { organization, project, sourceFile, createPersonTask } = await createFileWithStrings();
    const task = await createPersonTask({ kind: "proofread", targetLocales: ["fr-FR", "de-DE"] });
    const state = { organizationId: organization.id, jobId: task.id, step: "review" as const };
    await setTaskAnalysisStatus({ ...state, status: "pending" });
    const input = {
      ...state,
      projectId: project.id,
      sourceLocale: "en-US",
      repositorySourceFileId: sourceFile.id,
    };
    await analyseTaskLanguage({ ...input, targetLocale: "fr-FR" });
    expect(await readTaskAnalysis(state)).toMatchObject([
      { step: "review", status: "pending", strings: 2, incomplete: false },
    ]);

    // The memory could not be read for the second language: its strings still arrive, without a band.
    await analyseTaskLanguage({ ...input, targetLocale: "de-DE", withoutMemory: true });
    const buckets = await db
      .select({
        targetLocale: schema.reportingAnalyses.targetLocale,
        bucket: schema.reportingAnalyses.bucket,
      })
      .from(schema.reportingAnalyses)
      .where(eq(schema.reportingAnalyses.jobId, task.id));
    const bucketsOf = (locale: string) =>
      buckets.filter((row) => row.targetLocale === locale).map((row) => row.bucket);
    expect(bucketsOf("de-DE")).toEqual(["unavailable", "unavailable"]);
    expect(bucketsOf("fr-FR")).toEqual(["new", "new"]);
  });
});

describe("readTaskAnalysis", () => {
  it("reads a pending analysis left alone for an hour as failed", async () => {
    const { organization, createPersonTask } = await createFileWithStrings();
    const task = await createPersonTask({ kind: "proofread" });
    const state = { organizationId: organization.id, jobId: task.id, step: "review" as const };
    await setTaskAnalysisStatus({ ...state, status: "pending" });
    const inAnHour = new Date(Date.now() + 61 * 60_000);
    expect(await readTaskAnalysis(state)).toMatchObject([{ status: "pending" }]);
    expect(await readTaskAnalysis(state, inAnHour)).toMatchObject([
      { status: "failed", error: "reporting_task_analysis_stopped" },
    ]);
    // A finished analysis is never stale, and its outcome is kept whole.
    await setTaskAnalysisStatus({ ...state, status: "done", incomplete: true, strings: 2 });
    expect(await readTaskAnalysis(state, inAnHour)).toMatchObject([
      { status: "done", incomplete: true, strings: 2, error: null },
    ]);
  });
});

describe("openPersonTaskForString", () => {
  it("finds the newest open task for people covering the file, language and step", async () => {
    const { organization, project, sourceFile, createPersonTask } = await createFileWithStrings();
    const older = await createPersonTask({
      kind: "proofread",
      createdAt: new Date(Date.now() - 60_000),
    });
    const newer = await createPersonTask({ kind: "proofread" });
    const lookup = (step: "translation" | "review", targetLocale = "fr-FR") =>
      openPersonTaskForString({
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: sourceFile.id,
        targetLocale,
        step,
      });
    await expect(lookup("review")).resolves.toBe(newer.id);
    // A proofread task covers approvals, not translations; and only its own languages.
    await expect(lookup("translation")).resolves.toBeUndefined();
    await expect(lookup("review", "de-DE")).resolves.toBeUndefined();

    // A task that ended before the save covers nothing more; the older open one takes over.
    // (Ended a minute ago: a lookup "now" would otherwise tie with the update's own time.)
    await db
      .update(schema.jobs)
      .set({ status: "succeeded", updatedAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.jobs.id, newer.id));
    await expect(lookup("review")).resolves.toBe(older.id);

    const translate = await createPersonTask({ kind: "translation" });
    await expect(lookup("translation")).resolves.toBe(translate.id);

    // A save made while the task was open still belongs to it once the task has ended.
    const ended = new Date();
    await db
      .update(schema.jobs)
      .set({ status: "succeeded", updatedAt: ended })
      .where(eq(schema.jobs.id, older.id));
    const before = new Date(ended.getTime() - 60_000);
    await expect(
      openPersonTaskForString({
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: sourceFile.id,
        targetLocale: "fr-FR",
        step: "review",
        savedAt: before,
      }),
    ).resolves.toBe(older.id);
    await expect(lookup("review")).resolves.toBeUndefined();

    // A job an agent ran is not a task for people, whoever owns it.
    await db
      .update(schema.jobs)
      .set({ workflowRunId: "wrun_agent" })
      .where(eq(schema.jobs.id, translate.id));
    await expect(lookup("translation")).resolves.toBeUndefined();
  });

  it("judges a task's end by when it ended, not by a later change", async () => {
    const { organization, project, sourceFile, createPersonTask } = await createFileWithStrings();
    const task = await createPersonTask({
      kind: "proofread",
      createdAt: new Date(Date.now() - 10 * 60_000),
    });
    const endedAt = new Date(Date.now() - 5 * 60_000);
    await db
      .update(schema.jobs)
      .set({ status: "cancelled", completedAt: endedAt, updatedAt: new Date() })
      .where(eq(schema.jobs.id, task.id));
    const savedAt = (offsetMs: number) =>
      openPersonTaskForString({
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: sourceFile.id,
        targetLocale: "fr-FR",
        step: "review",
        savedAt: new Date(endedAt.getTime() + offsetMs),
      });
    await expect(savedAt(-60_000)).resolves.toBe(task.id);
    await expect(savedAt(60_000)).resolves.toBeUndefined();
  });
});

describe("personTaskForSave", () => {
  it("counts a person's edit inside a proofread task as its review work, unless a translate task covers it", async () => {
    const { organization, project, sourceFile, createPersonTask } = await createFileWithStrings();
    const lookup = (step: "translation" | "review", byPerson = true) =>
      personTaskForSave({
        organizationId: organization.id,
        projectId: project.id,
        repositorySourceFileId: sourceFile.id,
        targetLocale: "fr-FR",
        step,
        byPerson,
      });
    await expect(lookup("translation")).resolves.toBeUndefined();
    const proofread = await createPersonTask({ kind: "proofread" });
    await expect(lookup("translation")).resolves.toEqual({ jobId: proofread.id, step: "review" });
    await expect(lookup("review")).resolves.toEqual({ jobId: proofread.id, step: "review" });
    // An agent's or an import's edit stays translation work on the job that produced the text;
    // its approval is still the task's.
    await expect(lookup("translation", false)).resolves.toBeUndefined();
    await expect(lookup("review", false)).resolves.toEqual({ jobId: proofread.id, step: "review" });
    // A translate task for people takes the edits made while it is open.
    const translate = await createPersonTask({ kind: "translation" });
    await expect(lookup("translation")).resolves.toEqual({
      jobId: translate.id,
      step: "translation",
    });
  });
});

describe("personTaskAt", () => {
  it("counts a task created in the same millisecond as a save as covering it", () => {
    const at = new Date("2026-10-26T10:00:00.123Z");
    const tasks = [
      { id: "newer", createdAt: new Date(at.getTime() + 1), endedAt: null },
      { id: "same", createdAt: at, endedAt: null },
    ];
    expect(personTaskAt(tasks, at)).toBe("same");
    // A save made now belongs to the newest open task.
    expect(personTaskAt(tasks)).toBe("newer");
  });
});
