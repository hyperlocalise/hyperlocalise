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

import { createHash, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { ensureRepositorySourceFile } from "@/lib/file-storage/records";
import { saveNativeProjectContentEditorTranslation } from "@/lib/projects/content-editor/native-content-editor-service";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

import { captureAiUsage } from "./ai-cost";
import { queryBudgets } from "./cost-queries";
import {
  analysisScopeLockKey,
  captureAnalysis,
  captureCompletions,
  captureJobStatus,
  isMemoryUnavailableError,
  MemoryScoreCache,
  recordAnalysis,
  resolveReportingRate,
  scoreAgainstMemory,
  sourceSimilarity,
} from "./capture";
import { refreshPendingSummary } from "./summary";

const resolveWorkspaceReportsFlagMock = vi.hoisted(() => vi.fn(async () => true));
/** The project's memories, as the app reads them; one test makes the read fail. */
const memoryMocks = vi.hoisted(() => ({
  listAttachedProjectMemoryIds: vi.fn<(projectId: string) => Promise<string[]>>(),
}));

vi.mock("@/lib/memory/ensure-default-native-project-memory", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/memory/ensure-default-native-project-memory")>();
  memoryMocks.listAttachedProjectMemoryIds.mockImplementation(actual.listAttachedProjectMemoryIds);
  return { ...actual, listAttachedProjectMemoryIds: memoryMocks.listAttachedProjectMemoryIds };
});

vi.mock("@/lib/flags/workspace-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workspace-flags")>();
  return {
    ...actual,
    resolveWorkspaceReportsFlag: resolveWorkspaceReportsFlagMock,
  };
});

const projectFixture = createProjectTestFixture();
const SOURCE_PATH = "locales/en.json";

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  resolveWorkspaceReportsFlagMock.mockReset();
  resolveWorkspaceReportsFlagMock.mockResolvedValue(true);
  await projectFixture.cleanup();
});

async function createProjectWithTranslationKey() {
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
    entries: [{ key: "greeting", text: "Hello world", context: null }],
  });
  const [translationKey] = await db
    .select({
      id: schema.projectTranslationKeys.id,
      sourceText: schema.projectTranslationKeys.sourceText,
    })
    .from(schema.projectTranslationKeys)
    .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id))
    .limit(1);
  return { organization, project, user, translationKey: translationKey! };
}

describe("reporting capture", () => {
  it("scores source similarity without requiring an exact match", () => {
    expect(sourceSimilarity("Hello world", "Hello world")).toBe(100);
    expect(sourceSimilarity("Hello world", "Hello worlds")).toBeGreaterThan(80);
    expect(sourceSimilarity("Hello", "")).toBe(0);
  });

  it("preserves existing CAT job linkage and records billable work", async () => {
    const { organization, project, user, translationKey } = await createProjectWithTranslationKey();
    const [job] = await db
      .insert(schema.jobs)
      .values({
        id: `job_${randomUUID()}`,
        organizationId: organization.id,
        projectId: project.id,
        createdByUserId: user.id,
        kind: "translation",
        status: "running",
        workflowRunId: `run_${randomUUID()}`,
        inputPayload: {},
      })
      .returning();
    await db.insert(schema.projectTranslations).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: translationKey.id,
      targetLocale: "fr-FR",
      text: "Bonjour",
      status: "draft",
      provenance: "translation_job",
      sourceJobId: job.id,
    });

    const saved = await saveNativeProjectContentEditorTranslation({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: SOURCE_PATH,
      targetLocale: "fr-FR",
      translationKeyId: translationKey.id,
      text: "Bonjour le monde",
      actorUserId: user.id,
    });
    expect(saved?.status).toBe("draft");

    const [translation] = await db
      .select({
        sourceJobId: schema.projectTranslations.sourceJobId,
        provenance: schema.projectTranslations.provenance,
      })
      .from(schema.projectTranslations)
      .where(
        and(
          eq(schema.projectTranslations.translationKeyId, translationKey.id),
          eq(schema.projectTranslations.targetLocale, "fr-FR"),
        ),
      );
    expect(translation).toMatchObject({
      sourceJobId: job.id,
      provenance: "manual",
    });

    const [analysis] = await db
      .select({
        jobId: schema.reportingAnalyses.jobId,
        billable: schema.reportingAnalyses.billable,
        isCurrent: schema.reportingAnalyses.isCurrent,
      })
      .from(schema.reportingAnalyses)
      .where(
        and(
          eq(schema.reportingAnalyses.organizationId, organization.id),
          eq(schema.reportingAnalyses.segmentId, translationKey.id),
          eq(schema.reportingAnalyses.jobId, job.id),
        ),
      );
    expect(analysis).toMatchObject({
      jobId: job.id,
      billable: true,
      isCurrent: true,
    });

    const completions = await db
      .select({ id: schema.reportingActivity.id })
      .from(schema.reportingActivity)
      .where(
        and(
          eq(schema.reportingActivity.organizationId, organization.id),
          eq(schema.reportingActivity.kind, "completion"),
          eq(schema.reportingActivity.jobId, job.id),
        ),
      );
    expect(completions).toHaveLength(1);
  });

  it("records manual CAT work without a job instead of skipping reporting", async () => {
    const { organization, project, user, translationKey } = await createProjectWithTranslationKey();

    await saveNativeProjectContentEditorTranslation({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: SOURCE_PATH,
      targetLocale: "fr-FR",
      translationKeyId: translationKey.id,
      text: "Bonjour",
      actorUserId: user.id,
    });

    const analyses = await db
      .select({
        jobId: schema.reportingAnalyses.jobId,
        billable: schema.reportingAnalyses.billable,
      })
      .from(schema.reportingAnalyses)
      .where(
        and(
          eq(schema.reportingAnalyses.organizationId, organization.id),
          eq(schema.reportingAnalyses.segmentId, translationKey.id),
        ),
      );
    expect(analyses).toEqual([{ jobId: null, billable: true }]);

    await saveNativeProjectContentEditorTranslation({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: SOURCE_PATH,
      targetLocale: "fr-FR",
      translationKeyId: translationKey.id,
      text: "Bonjour encore",
      actorUserId: user.id,
    });
    const afterRetry = await db
      .select({
        id: schema.reportingAnalyses.id,
        isCurrent: schema.reportingAnalyses.isCurrent,
      })
      .from(schema.reportingAnalyses)
      .where(
        and(
          eq(schema.reportingAnalyses.organizationId, organization.id),
          eq(schema.reportingAnalyses.segmentId, translationKey.id),
        ),
      );
    expect(afterRetry).toHaveLength(1);
    expect(afterRetry[0]?.isCurrent).toBe(true);

    const completions = await db
      .select({ id: schema.reportingActivity.id })
      .from(schema.reportingActivity)
      .where(
        and(
          eq(schema.reportingActivity.organizationId, organization.id),
          eq(schema.reportingActivity.kind, "completion"),
        ),
      );
    expect(completions).toHaveLength(1);
    const costs = await db
      .select({ id: schema.reportingCosts.id })
      .from(schema.reportingCosts)
      .where(eq(schema.reportingCosts.organizationId, organization.id));
    expect(costs).toHaveLength(1);
  });

  it("matches approved memory entries", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    const [memory] = await db
      .insert(schema.memories)
      .values({
        organizationId: organization.id,
        createdByUserId: user.id,
        name: "Reporting TM",
      })
      .returning();
    await db.insert(schema.projectMemories).values({
      organizationId: organization.id,
      projectId: project.id,
      memoryId: memory.id,
    });
    await db.insert(schema.memoryEntries).values({
      memoryId: memory.id,
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      sourceText: "Hello world",
      normalizedSourceText: normalizeTranslationMemorySourceText("Hello world"),
      targetText: "Bonjour le monde",
      reviewStatus: "approved",
    });
    await db.insert(schema.memoryEntries).values({
      memoryId: memory.id,
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      sourceText: "Hello worlds",
      normalizedSourceText: normalizeTranslationMemorySourceText("Hello worlds"),
      targetText: "Bonjour les mondes",
      reviewStatus: "approved",
    });

    expect(
      (
        await scoreAgainstMemory({
          memoryIds: [memory.id],
          sourceLocale: "en-US",
          targetLocale: "fr-FR",
          sourceTexts: ["Hello world"],
        })
      ).get("Hello world"),
    ).toBe(100);
    expect(
      (
        await scoreAgainstMemory({
          memoryIds: [memory.id],
          sourceLocale: "en-US",
          targetLocale: "fr-FR",
          sourceTexts: ["Hello worlds!"],
        })
      ).get("Hello worlds!"),
    ).toBeGreaterThan(80);

    await captureAnalysis({
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      sourceEntries: { greeting: "Hello world", other: "Hello worlds!" },
      billable: true,
    });
    const rows = await db
      .select({
        segmentId: schema.reportingAnalyses.segmentId,
        matchScore: schema.reportingAnalyses.matchScore,
      })
      .from(schema.reportingAnalyses)
      .where(eq(schema.reportingAnalyses.organizationId, organization.id));
    expect(rows.find((row) => row.segmentId === "greeting")?.matchScore).toBe(100);
    expect(rows.find((row) => row.segmentId === "other")?.matchScore).toBeGreaterThan(80);
    expect(
      (
        await scoreAgainstMemory({
          memoryIds: [memory.id],
          sourceLocale: "en-US",
          targetLocale: "fr-FR",
          sourceTexts: ["hello world"],
        })
      ).get("hello world"),
    ).toBe(99);
    expect(
      (
        await scoreAgainstMemory({
          memoryIds: [memory.id],
          sourceLocale: "en-US",
          targetLocale: "fr-FR",
          sourceTexts: ["Hello brave world"],
        })
      ).get("Hello brave world"),
    ).toBeGreaterThan(50);
  });

  it("scores a string saved alone the same as one in a larger group", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    const [memory] = await db
      .insert(schema.memories)
      .values({ organizationId: organization.id, createdByUserId: user.id, name: "Reporting TM" })
      .returning();
    await db.insert(schema.projectMemories).values({
      organizationId: organization.id,
      projectId: project.id,
      memoryId: memory.id,
    });
    await db.insert(schema.memoryEntries).values({
      memoryId: memory.id,
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      sourceText: "Download the translated files once every language has been approved",
      normalizedSourceText: normalizeTranslationMemorySourceText(
        "Download the translated files once every language has been approved",
      ),
      targetText: "Téléchargez les fichiers traduits",
      reviewStatus: "approved",
    });
    // Every word misspelled, so a keyword search finds nothing; the characters still match 80%.
    const typos = "Dxwnlxad txe traxslaxed fxles oxce exery lxnguxge hxs beex appxoved";
    const scoreOf = async (sourceEntries: Record<string, string>) => {
      await captureAnalysis({
        organizationId: organization.id,
        projectId: project.id,
        sourceLocale: "en-US",
        targetLocale: "fr-FR",
        sourceEntries,
      });
      const [row] = await db
        .select({ matchScore: schema.reportingAnalyses.matchScore })
        .from(schema.reportingAnalyses)
        .where(
          and(
            eq(schema.reportingAnalyses.organizationId, organization.id),
            eq(schema.reportingAnalyses.segmentId, Object.keys(sourceEntries)[0]),
          ),
        );
      return row?.matchScore;
    };

    expect(await scoreOf({ alone: typos })).toBe(80);
    expect(
      await scoreOf({ grouped: typos, b: "Save and close", c: "Open", d: "Cancel", e: "Delete" }),
    ).toBe(80);
  });

  it("scores a memory larger than one slice the same as one loaded whole", async () => {
    const { organization, user } = await projectFixture.createStoredProjectFixture();
    const [memory] = await db
      .insert(schema.memories)
      .values({ organizationId: organization.id, createdByUserId: user.id, name: "Sliced TM" })
      .returning();
    const sources = [
      "Download the translated files once every language has been approved",
      "Save your changes before you leave this page",
      "Invite team members to collaborate on translations",
      "Your subscription renews on the first day of every month",
      "Connect a repository to pick up new strings",
    ];
    await db.insert(schema.memoryEntries).values(
      sources.map((sourceText) => ({
        memoryId: memory.id,
        sourceLocale: "en-US",
        targetLocale: "fr-FR",
        sourceText,
        normalizedSourceText: normalizeTranslationMemorySourceText(sourceText),
        targetText: "Traduction",
        reviewStatus: "approved" as const,
      })),
    );
    const input = {
      memoryIds: [memory.id],
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      sourceTexts: [
        "Dxwnlxad txe traxslaxed fxles oxce exery lxnguxge hxs beex appxoved",
        "Save your changes before you leave the page",
        "Invite team members to collaborate on translations",
        "Quarterly invoices are emailed to the billing contact",
        "Connect a repository",
      ],
    };

    const whole = await scoreAgainstMemory(input);
    expect(whole.get(input.sourceTexts[0])).toBe(80);
    expect(whole.get(input.sourceTexts[2])).toBe(100);
    for (const sliceEntries of [1, 2, 3]) {
      expect(await scoreAgainstMemory(input, { sliceEntries })).toEqual(whole);
    }
    expect(
      await scoreAgainstMemory(
        { ...input, sourceTexts: [input.sourceTexts[0]] },
        { sliceEntries: 2 },
      ),
    ).toEqual(new Map([[input.sourceTexts[0], 80]]));
  });

  it("loads a memory once for scores that share it, through the cache", async () => {
    const { organization, user } = await projectFixture.createStoredProjectFixture();
    const [memory] = await db
      .insert(schema.memories)
      .values({ organizationId: organization.id, createdByUserId: user.id, name: "Cached TM" })
      .returning();
    await db.insert(schema.memoryEntries).values({
      memoryId: memory.id,
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      sourceText: "Hello world",
      normalizedSourceText: normalizeTranslationMemorySourceText("Hello world"),
      targetText: "Bonjour le monde",
      reviewStatus: "approved",
    });
    const input = { memoryIds: [memory.id], sourceLocale: "en-US", targetLocale: "fr-FR" };
    const cache = new MemoryScoreCache();
    const selects = vi.spyOn(db, "select");

    const first = await scoreAgainstMemory({ ...input, sourceTexts: ["Hello world"] }, { cache });
    const loadsAfterFirst = selects.mock.calls.length;
    const second = await scoreAgainstMemory(
      { ...input, sourceTexts: ["Hello worlds", "Hello", "world", "Hello there world"] },
      { cache },
    );
    expect(selects.mock.calls.length).toBe(loadsAfterFirst);
    selects.mockRestore();
    expect(first.get("Hello world")).toBe(100);
    expect(second).toEqual(
      await scoreAgainstMemory({
        ...input,
        sourceTexts: ["Hello worlds", "Hello", "world", "Hello there world"],
      }),
    );
  });

  it("keeps one current analysis when captures of different source texts compete", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    const scope = {
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
    };
    const currentRows = () =>
      db
        .select({ id: schema.reportingAnalyses.id })
        .from(schema.reportingAnalyses)
        .where(
          and(
            eq(schema.reportingAnalyses.organizationId, organization.id),
            eq(schema.reportingAnalyses.segmentId, "greeting"),
            eq(schema.reportingAnalyses.isCurrent, true),
          ),
        );
    // Hold the scope's lock from another connection, so both captures reach it before either writes.
    const holder = await db.$client.connect();
    await holder.query("begin");
    await holder.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      analysisScopeLockKey({ ...scope, step: "translation" }),
    ]);
    const captures = ["Save changes", "Save all changes"].map((text) =>
      captureAnalysis({ ...scope, sourceEntries: { greeting: text } }),
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await currentRows()).toEqual([]);

    await holder.query("commit");
    holder.release();
    await Promise.all(captures);
    expect(await currentRows()).toHaveLength(1);
  });

  it("credits the person who post-edits a string a job already completed", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    const scope = {
      organizationId: organization.id,
      targetLocale: "fr-FR",
      sourceEntries: { greeting: "Hello world" },
    };
    await captureAnalysis({
      ...scope,
      projectId: project.id,
      sourceLocale: "en-US",
      billable: true,
    });
    await captureCompletions({ ...scope, provenance: "automated", source: "ai" });
    await captureCompletions({
      ...scope,
      provenance: "human",
      actorUserId: user.id,
      source: "person",
      unchanged: { greeting: false },
    });

    // The person rewrote the job's text, so the finished text is theirs, and changed.
    const completions = await db
      .select({
        actorUserId: schema.reportingActivity.actorUserId,
        source: schema.reportingActivity.source,
        unchanged: schema.reportingActivity.unchanged,
      })
      .from(schema.reportingActivity)
      .where(
        and(
          eq(schema.reportingActivity.organizationId, organization.id),
          eq(schema.reportingActivity.kind, "completion"),
        ),
      );
    expect(completions).toEqual([{ actorUserId: user.id, source: "person", unchanged: false }]);
  });

  it("dates a string a person finished after a job by the person's save, and marks both days", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    const scope = {
      organizationId: organization.id,
      targetLocale: "fr-FR",
      sourceEntries: { greeting: "Hello world" },
    };
    const jobDay = new Date("2026-10-01T10:00:00Z");
    const personDay = new Date("2026-10-20T10:00:00Z");
    await captureAnalysis({
      ...scope,
      projectId: project.id,
      sourceLocale: "en-US",
      occurredAt: { greeting: jobDay },
    });
    await captureCompletions({
      ...scope,
      provenance: "automated",
      source: "ai",
      occurredAt: { greeting: jobDay },
    });
    await db.delete(schema.reportingSummaryQueue);
    await captureCompletions({
      ...scope,
      provenance: "human",
      actorUserId: user.id,
      source: "person",
      unchanged: { greeting: false },
      occurredAt: { greeting: personDay },
    });

    // The rewrite is the person's work on their day, so a week's "AI" and "people" bars both move.
    const [completion] = await db
      .select({ createdAt: schema.reportingActivity.createdAt })
      .from(schema.reportingActivity)
      .where(
        and(
          eq(schema.reportingActivity.organizationId, organization.id),
          eq(schema.reportingActivity.kind, "completion"),
        ),
      );
    expect(completion.createdAt).toEqual(personDay);
    const marked = await db
      .select({ day: schema.reportingSummaryQueue.day })
      .from(schema.reportingSummaryQueue)
      .where(eq(schema.reportingSummaryQueue.organizationId, organization.id));
    expect(marked.map((mark) => mark.day).sort()).toEqual(["2026-10-01", "2026-10-20"]);
  });

  it("tries the Reports flag once more when its lookup fails, and records nothing, saying so, when it fails twice", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    const capture = (targetLocale: string) =>
      captureAnalysis({
        organizationId: organization.id,
        projectId: project.id,
        sourceLocale: "en-US",
        targetLocale,
        sourceEntries: { greeting: "Hello world" },
      });
    const recorded = () =>
      db
        .select({ targetLocale: schema.reportingAnalyses.targetLocale })
        .from(schema.reportingAnalyses)
        .where(eq(schema.reportingAnalyses.organizationId, organization.id));

    resolveWorkspaceReportsFlagMock
      .mockRejectedValueOnce(new Error("flags unavailable"))
      .mockResolvedValueOnce(true);
    await capture("fr-FR");
    expect(await recorded()).toEqual([{ targetLocale: "fr-FR" }]);

    resolveWorkspaceReportsFlagMock.mockRejectedValue(new Error("flags unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await capture("de-DE");
    expect(await recorded()).toEqual([{ targetLocale: "fr-FR" }]);
    expect(error).toHaveBeenCalledWith(
      "reporting_flag_lookup_failed",
      expect.objectContaining({ organizationId: organization.id }),
    );
    error.mockRestore();
  });

  it("keeps a deleted task's id on its finished work, costs and time, and drops its pricing", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    const [task] = await db
      .insert(schema.jobs)
      .values({
        id: `job_${randomUUID()}`,
        organizationId: organization.id,
        projectId: project.id,
        createdByUserId: user.id,
        kind: "proofread",
        status: "waiting_for_review",
        inputPayload: {},
      })
      .returning();
    const scope = {
      organizationId: organization.id,
      jobId: task.id,
      targetLocale: "fr-FR",
      sourceEntries: { greeting: "Hello world" },
      step: "review" as const,
    };
    await captureAnalysis({ ...scope, projectId: project.id, sourceLocale: "en", billable: true });
    await captureCompletions({ ...scope, provenance: "human", actorUserId: user.id });
    await db.insert(schema.reportingTimeEntries).values({
      organizationId: organization.id,
      projectId: project.id,
      jobId: task.id,
      contributorId: user.id,
      step: "review",
      targetLocale: "fr-FR",
      workDate: new Date(),
      minutes: 30,
    });
    await db.insert(schema.reportingTaskRates).values({
      organizationId: organization.id,
      jobId: task.id,
      step: "review",
      overrideUsd: "50.00000000",
    });

    await db.delete(schema.jobs).where(eq(schema.jobs.id, task.id));

    // History stays the task's, shown as "Deleted task"; its pricing goes with the task.
    const jobIds = async (
      table:
        | typeof schema.reportingActivity
        | typeof schema.reportingCosts
        | typeof schema.reportingTimeEntries,
    ) =>
      (
        await db
          .select({ jobId: table.jobId })
          .from(table)
          .where(eq(table.organizationId, organization.id))
      ).map((row) => row.jobId);
    expect(await jobIds(schema.reportingActivity)).toEqual([task.id]);
    expect(await jobIds(schema.reportingCosts)).toEqual([task.id]);
    expect(await jobIds(schema.reportingTimeEntries)).toEqual([task.id]);
    expect(
      await db
        .select()
        .from(schema.reportingTaskRates)
        .where(eq(schema.reportingTaskRates.organizationId, organization.id)),
    ).toEqual([]);
  });

  it("names a memory that cannot be read when a strict write fails, and records without a band otherwise", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    const input = {
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      sourceEntries: { greeting: "Hello world" },
    };
    memoryMocks.listAttachedProjectMemoryIds.mockRejectedValueOnce(new Error("memory down"));
    const failure = await recordAnalysis(input).catch((error: unknown) => error);
    expect(isMemoryUnavailableError(failure)).toBe(true);
    expect((failure as Error).message).toContain("memory down");
    // Any other failure is not one: the caller must not record strings without bands for it.
    expect(isMemoryUnavailableError(new Error("connection reset"))).toBe(false);

    // The forgiving write records the strings with no band instead.
    memoryMocks.listAttachedProjectMemoryIds.mockRejectedValueOnce(new Error("memory down"));
    await captureAnalysis(input);
    const analyses = await db
      .select({ bucket: schema.reportingAnalyses.bucket })
      .from(schema.reportingAnalyses)
      .where(eq(schema.reportingAnalyses.organizationId, organization.id));
    expect(analyses).toEqual([{ bucket: "unavailable" }]);
  });

  it("skips analysis capture when workspace reports is disabled", async () => {
    resolveWorkspaceReportsFlagMock.mockResolvedValue(false);
    const { organization, project } = await projectFixture.createStoredProjectFixture();

    await captureAnalysis({
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      sourceEntries: { greeting: "Hello world" },
    });

    const rows = await db
      .select({ id: schema.reportingAnalyses.id })
      .from(schema.reportingAnalyses)
      .where(eq(schema.reportingAnalyses.organizationId, organization.id));
    expect(rows).toHaveLength(0);
  });

  it("keeps analysis capture from failing the caller", async () => {
    await expect(
      captureAnalysis({
        organizationId: randomUUID(),
        projectId: `project_${randomUUID()}`,
        sourceLocale: "en-US",
        targetLocale: "fr-FR",
        sourceEntries: { source: "Hello" },
      }),
    ).resolves.toBeUndefined();
  });

  it("keeps usage capture from failing the caller", async () => {
    await expect(
      captureAiUsage({
        organizationId: randomUUID(),
        invocationId: `usage_${randomUUID()}`,
        provider: "openai",
        model: "gpt-4o",
        inputTokens: 10,
        outputTokens: 4,
      }),
    ).resolves.toBeUndefined();
  });

  it("keeps job status capture from failing the caller", async () => {
    await expect(
      captureJobStatus({
        jobId: `job_${randomUUID()}`,
        status: "running",
        operationKey: `status:test:${randomUUID()}`,
      }),
    ).resolves.toBeUndefined();

    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    const workflowRunId = `run_${randomUUID()}`;
    const [job] = await db
      .insert(schema.jobs)
      .values({
        id: `job_${randomUUID()}`,
        organizationId: organization.id,
        projectId: project.id,
        createdByUserId: user.id,
        kind: "translation",
        status: "running",
        workflowRunId,
        inputPayload: {},
      })
      .returning();

    const insertSpy = vi.spyOn(db, "insert").mockImplementation(() => {
      throw new Error("reporting unavailable");
    });
    try {
      await expect(
        captureJobStatus({
          jobId: job.id,
          status: "running",
          operationKey: `status:${workflowRunId}:running`,
        }),
      ).resolves.toBeUndefined();
    } finally {
      insertSpy.mockRestore();
    }
  });

  it("prices a person's work in the rate's own unit", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    await db.insert(schema.reportingBudgets).values({
      organizationId: organization.id,
      projectId: project.id,
      budget: "1000.00000000",
      rateCardName: "Per character",
    });
    await db.insert(schema.reportingRates).values({
      organizationId: organization.id,
      name: "Per character",
      sourceLocale: "en",
      targetLocale: "ja-JP",
      step: "translation",
      basis: "character",
      rate: "0.05000000",
      percentages: { new: 100 },
    });
    const sourceEntries = { greeting: "Hello world" };
    await captureAnalysis({
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: "en",
      targetLocale: "ja-JP",
      sourceEntries,
      billable: true,
    });
    await captureCompletions({
      organizationId: organization.id,
      targetLocale: "ja-JP",
      sourceEntries,
      provenance: "human",
      actorUserId: user.id,
    });

    const [cost] = await db
      .select({ amountUsd: schema.reportingCosts.amountUsd, basis: schema.reportingCosts.basis })
      .from(schema.reportingCosts)
      .where(
        and(
          eq(schema.reportingCosts.organizationId, organization.id),
          eq(schema.reportingCosts.kind, "human"),
        ),
      );
    // "Hello world": 10 characters without spaces at $0.05.
    expect(cost).toEqual({ amountUsd: "0.50000000", basis: "rate" });
  });

  describe("pricing finished work", () => {
    const WORDS = "Hello world";
    const humanCosts = (organizationId: string) =>
      db
        .select({ amountUsd: schema.reportingCosts.amountUsd, basis: schema.reportingCosts.basis })
        .from(schema.reportingCosts)
        .where(
          and(
            eq(schema.reportingCosts.organizationId, organizationId),
            eq(schema.reportingCosts.kind, "human"),
          ),
        );
    const line = (
      organizationId: string,
      name: string,
      basis: "word" | "hour",
      rate: string,
      percentages: Record<string, number> = { new: 100 },
    ) => ({
      organizationId,
      name,
      sourceLocale: "en",
      targetLocale: "fr-FR",
      step: "review" as const,
      basis,
      rate,
      percentages,
    });
    const createTask = async (organizationId: string, projectId: string, userId: string) => {
      const [task] = await db
        .insert(schema.jobs)
        .values({
          id: `job_${randomUUID()}`,
          organizationId,
          projectId,
          createdByUserId: userId,
          kind: "proofread",
          status: "waiting_for_review",
          inputPayload: {},
        })
        .returning();
      return task!;
    };

    it("prices work at the task's own card, set after its strings arrived, not the budget's", async () => {
      const { organization, project, user } = await projectFixture.createStoredProjectFixture();
      const task = await createTask(organization.id, project.id, user.id);
      // The budget's card pays review by the hour; the task's card, set once the quote was read,
      // pays per word. Before, the strings kept the hourly line they arrived under and the work
      // was recorded at $0.
      await db.insert(schema.reportingBudgets).values({
        organizationId: organization.id,
        projectId: project.id,
        budget: "1000.00000000",
        rateCardName: "Hourly",
      });
      await db
        .insert(schema.reportingRates)
        .values([
          line(organization.id, "Hourly", "hour", "60.00000000"),
          line(organization.id, "Task card", "word", "0.50000000"),
        ]);
      const scope = {
        organizationId: organization.id,
        jobId: task.id,
        targetLocale: "fr-FR",
        sourceEntries: { greeting: WORDS },
        step: "review" as const,
      };
      await captureAnalysis({
        ...scope,
        projectId: project.id,
        sourceLocale: "en",
        billable: true,
      });
      await db.insert(schema.reportingTaskRates).values({
        organizationId: organization.id,
        jobId: task.id,
        step: "review",
        rateCardName: "Task card",
        pricedAt: sql`clock_timestamp()`,
      });
      await captureCompletions({ ...scope, provenance: "human", actorUserId: user.id });

      expect(await humanCosts(organization.id)).toEqual([
        { amountUsd: "1.00000000", basis: "rate" },
      ]);
    });

    it("prices nothing per string under an hourly task card, whatever the budget's card pays", async () => {
      const { organization, project, user } = await projectFixture.createStoredProjectFixture();
      const task = await createTask(organization.id, project.id, user.id);
      await db.insert(schema.reportingBudgets).values({
        organizationId: organization.id,
        projectId: project.id,
        budget: "1000.00000000",
        rateCardName: "Per word",
      });
      await db
        .insert(schema.reportingRates)
        .values([
          line(organization.id, "Per word", "word", "0.10000000"),
          line(organization.id, "Hourly", "hour", "60.00000000"),
        ]);
      const scope = {
        organizationId: organization.id,
        jobId: task.id,
        targetLocale: "fr-FR",
        sourceEntries: { greeting: WORDS },
        step: "review" as const,
      };
      await captureAnalysis({
        ...scope,
        projectId: project.id,
        sourceLocale: "en",
        billable: true,
      });
      await db.insert(schema.reportingTaskRates).values({
        organizationId: organization.id,
        jobId: task.id,
        step: "review",
        rateCardName: "Hourly",
        pricedAt: sql`clock_timestamp()`,
      });
      await captureCompletions({ ...scope, provenance: "human", actorUserId: user.id });

      // The task's time is what the hourly line prices; its strings cost nothing on their own.
      expect(await humanCosts(organization.id)).toEqual([]);
    });

    it("pays work whose match band could not be worked out as new work, as the estimate does", async () => {
      const { organization, project, user } = await projectFixture.createStoredProjectFixture();
      await db.insert(schema.reportingBudgets).values({
        organizationId: organization.id,
        projectId: project.id,
        budget: "1000.00000000",
        rateCardName: "Per word",
      });
      await db
        .insert(schema.reportingRates)
        .values(line(organization.id, "Per word", "word", "0.10000000", { new: 50, "100": 0 }));
      // Recorded while the memory could not be read: no score, so no band.
      await db.insert(schema.reportingAnalyses).values({
        organizationId: organization.id,
        projectId: project.id,
        step: "review",
        segmentId: "greeting",
        sourceRevision: createHash("sha256").update(WORDS).digest("hex"),
        sourceLocale: "en",
        targetLocale: "fr-FR",
        words: 2,
        billable: true,
        bucket: "unavailable",
      });
      await captureCompletions({
        organizationId: organization.id,
        targetLocale: "fr-FR",
        sourceEntries: { greeting: WORDS },
        step: "review",
        provenance: "human",
        actorUserId: user.id,
      });

      // 2 words at $0.10, paid at the new band's 50%.
      expect(await humanCosts(organization.id)).toEqual([
        { amountUsd: "0.10000000", basis: "rate" },
      ]);
    });
  });

  it("records AI tokens without estimating a price", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    const invocationId = `usage_${randomUUID()}`;
    await captureAiUsage({
      organizationId: organization.id,
      projectId: project.id,
      invocationId,
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 1200,
      outputTokens: 300,
    });
    const [row] = await db
      .select({
        amountUsd: schema.reportingCosts.amountUsd,
        basis: schema.reportingCosts.basis,
        inputTokens: schema.reportingCosts.inputTokens,
        outputTokens: schema.reportingCosts.outputTokens,
      })
      .from(schema.reportingCosts)
      .where(eq(schema.reportingCosts.operationKey, `ai:${invocationId}`));
    expect(row).toEqual({
      amountUsd: null,
      basis: "unpriced",
      inputTokens: 1200,
      outputTokens: 300,
    });
  });

  it("treats a rate line taken off its card as no rate", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    await db.insert(schema.reportingBudgets).values({
      organizationId: organization.id,
      projectId: project.id,
      budget: "1000.00000000",
      rateCardName: "Standard",
    });
    const line = {
      organizationId: organization.id,
      name: "Standard",
      sourceLocale: "en",
      targetLocale: "fr-FR",
      step: "translation" as const,
      basis: "word" as const,
      rate: "0.12000000",
    };
    await db.insert(schema.reportingRates).values({ ...line, createdAt: new Date("2026-01-01") });
    const input = {
      organizationId: organization.id,
      projectId: project.id,
      sourceLocale: "en",
      targetLocale: "fr-FR",
      step: "translation" as const,
    };
    expect(await resolveReportingRate(input)).toMatchObject({ rate: "0.12000000" });
    await db
      .insert(schema.reportingRates)
      .values({ ...line, retired: true, createdAt: new Date("2026-02-01") });
    expect(await resolveReportingRate(input)).toBeNull();
  });

  it("forecasts a budget's unfinished per-character work and leaves AI out of its spend", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    await db.insert(schema.reportingBudgets).values({
      organizationId: organization.id,
      projectId: project.id,
      budget: "1000.00000000",
      rateCardName: "Per character",
    });
    await db.insert(schema.reportingRates).values({
      organizationId: organization.id,
      name: "Per character",
      sourceLocale: "en",
      targetLocale: "ja-JP",
      step: "translation",
      basis: "character",
      rate: "0.05000000",
      percentages: { new: 100 },
    });
    const [job] = await db
      .insert(schema.jobs)
      .values({
        id: `job_${randomUUID()}`,
        organizationId: organization.id,
        projectId: project.id,
        createdByUserId: user.id,
        kind: "translation",
        status: "running",
        workflowRunId: `run_${randomUUID()}`,
        inputPayload: {},
      })
      .returning();
    await captureAnalysis({
      organizationId: organization.id,
      projectId: project.id,
      jobId: job.id,
      sourceLocale: "en",
      targetLocale: "ja-JP",
      sourceEntries: { greeting: "Hello world" },
      billable: true,
    });
    await captureAiUsage({
      organizationId: organization.id,
      projectId: project.id,
      jobId: job.id,
      invocationId: `usage_${randomUUID()}`,
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 100,
      outputTokens: 40,
    });

    await refreshPendingSummary({ organizationIds: [organization.id] });
    const [budget] = await queryBudgets({
      organizationId: organization.id,
      projectIds: [project.id],
    });
    // "Hello world" still to translate: 10 characters at $0.05; the unpriced AI row is not spend.
    expect(budget).toMatchObject({
      spentUsd: "0.00000000",
      stillToComeUsd: "0.50000000",
      incomplete: false,
    });
  });
});
