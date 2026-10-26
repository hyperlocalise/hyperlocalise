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

import { captureEditorSaves, EDITOR_SAVE_CAPTURE_CUTOFF_MS } from "./editor-save-capture";

const mocks = vi.hoisted(() => ({
  // The capture task's own check, per workspace.
  readWorkosFeatureFlag: vi.fn(async (): Promise<boolean> => true),
  // The check inside the shared capture functions.
  resolveWorkspaceReportsFlag: vi.fn(async () => true),
  waitForWorkosFeatureFlags: vi.fn(async () => true),
}));

vi.mock("@/lib/flags/workspace-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workspace-flags")>();
  return {
    ...actual,
    resolveWorkspaceReportsFlag: mocks.resolveWorkspaceReportsFlag,
  };
});

vi.mock("@/lib/flags/workos-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workos-adapter")>();
  return {
    ...actual,
    waitForWorkosFeatureFlags: mocks.waitForWorkosFeatureFlags,
    readWorkosFeatureFlag: mocks.readWorkosFeatureFlag,
  };
});

const projectFixture = createProjectTestFixture();
const SOURCE_PATH = "locales/en.json";
/** A time well past the capture cutoff, so freshly inserted events count as settled. */
const LATER = () => new Date(Date.now() + EDITOR_SAVE_CAPTURE_CUTOFF_MS + 60_000);
/** A run moves positions up to its cut-off, so a later save in a test is dated after it. */
const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
    mock.mockResolvedValue(true);
  }
  await projectFixture.cleanup();
});

async function createProjectWithSavedOccurrences() {
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
      { key: "greeting_again", text: "Hello world", context: null },
    ],
  });
  const keys = await db
    .select({ id: schema.projectTranslationKeys.id })
    .from(schema.projectTranslationKeys)
    .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id));
  for (const key of keys) {
    await db.insert(schema.projectTranslations).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: key.id,
      targetLocale: "fr-FR",
      text: "Bonjour le monde",
      status: "draft",
      provenance: "manual",
    });
  }
  // A running task gives a workspace its position on first sight; start from just before now.
  await db.execute(sql`
    insert into reporting_capture_cursors (organization_id, last_event_created_at, last_event_id)
    values (${organization.id}, now() - interval '1 second', '00000000-0000-0000-0000-000000000000')
  `);
  return { organization, project, user, keyIds: keys.map((key) => key.id) };
}

async function positionOf(organizationId: string) {
  const [position] = await db
    .select({
      lastEventId: schema.reportingCaptureCursors.lastEventId,
      lastEventCreatedAt: schema.reportingCaptureCursors.lastEventCreatedAt,
    })
    .from(schema.reportingCaptureCursors)
    .where(eq(schema.reportingCaptureCursors.organizationId, organizationId));
  return position;
}

async function insertSaveEvent(input: {
  organizationId: string;
  projectId: string;
  actorUserId: string;
  segmentId: string;
  eventType?: "string_segment_translation_updated" | "string_segment_approved";
  nextStatus?: string;
  actorKind?: "user" | "agent";
  createdAt?: Date;
  extraPayload?: Record<string, string>;
}) {
  const [event] = await db
    .insert(schema.organizationActivityEvents)
    .values({
      organizationId: input.organizationId,
      actorKind: input.actorKind ?? "user",
      actorUserId: input.actorUserId,
      eventType: input.eventType ?? "string_segment_translation_updated",
      targetKind: "string_segment",
      targetId: input.segmentId,
      payload: {
        projectId: input.projectId,
        segmentId: input.segmentId,
        sourcePath: SOURCE_PATH,
        targetLocale: "fr-FR",
        nextStatus: input.nextStatus ?? "draft",
        ...input.extraPayload,
      },
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    })
    .returning({ id: schema.organizationActivityEvents.id });
  return event;
}

/** A proofread task for people on the fixture's file, into fr-FR. */
async function createProofreadTask(input: {
  organizationId: string;
  projectId: string;
  userId: string;
  createdAt?: Date;
}) {
  const [sourceFile] = await db
    .select({ id: schema.repositorySourceFiles.id })
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.projectId, input.projectId),
        eq(schema.repositorySourceFiles.sourcePath, SOURCE_PATH),
      ),
    );
  const storedFile = await insertStoredSourceFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    filename: "en.json",
    contentType: "application/json",
    sourceKind: "repository_file",
    metadata: { sourcePath: SOURCE_PATH },
  });
  const [version] = await db
    .insert(schema.repositorySourceFileVersions)
    .values({
      repositorySourceFileId: sourceFile!.id,
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: SOURCE_PATH,
      storedFileId: storedFile.id,
    })
    .returning();
  const [task] = await db
    .insert(schema.jobs)
    .values({
      id: `job_${randomUUID()}`,
      organizationId: input.organizationId,
      projectId: input.projectId,
      createdByUserId: input.userId,
      kind: "proofread",
      status: "waiting_for_review",
      inputPayload: { sourceLocale: "en-US", targetLocales: ["fr-FR"] },
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    })
    .returning();
  await db
    .insert(schema.translationJobDetails)
    .values({ jobId: task!.id, type: "file", sourceFileVersionId: version!.id });
  return task!;
}

// The task reads every workspace's events; other test files share the database and write save
// events of their own, so each run here is limited to the test's workspace.
describe("captureEditorSaves", () => {
  it("records every saved occurrence with the person, then advances the cursor", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    for (const segmentId of keyIds) {
      await insertSaveEvent({
        organizationId: organization.id,
        projectId: project.id,
        actorUserId: user.id,
        segmentId,
      });
    }

    const first = await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    expect(first.organizationsProcessed).toBe(1);
    expect(first.segmentsRecorded).toBe(2);

    const analyses = await db
      .select()
      .from(schema.reportingAnalyses)
      .where(eq(schema.reportingAnalyses.organizationId, organization.id));
    expect(analyses.map((row) => row.segmentId).sort()).toEqual([...keyIds].sort());
    expect(analyses.every((row) => row.billable && row.step === "translation")).toBe(true);

    const completions = await db
      .select()
      .from(schema.reportingActivity)
      .where(
        and(
          eq(schema.reportingActivity.organizationId, organization.id),
          eq(schema.reportingActivity.kind, "completion"),
        ),
      );
    expect(completions).toHaveLength(2);
    expect(completions.every((row) => row.actorUserId === user.id)).toBe(true);

    const [cursor] = await db
      .select()
      .from(schema.reportingCaptureCursors)
      .where(eq(schema.reportingCaptureCursors.organizationId, organization.id));
    expect(cursor).toBeDefined();

    // A second run finds nothing new for this workspace and changes nothing it recorded.
    await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    const [cursorAfter] = await db
      .select()
      .from(schema.reportingCaptureCursors)
      .where(eq(schema.reportingCaptureCursors.organizationId, organization.id));
    expect(cursorAfter.lastEventId).toBe(cursor.lastEventId);
    const completionsAfter = await db
      .select()
      .from(schema.reportingActivity)
      .where(
        and(
          eq(schema.reportingActivity.organizationId, organization.id),
          eq(schema.reportingActivity.kind, "completion"),
        ),
      );
    expect(completionsAfter).toHaveLength(2);
  });

  it("dates recorded work by when it was saved, not by when the task ran", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    // Saved half an hour from now, so the save time and the time of writing cannot coincide.
    const savedAt = minutesFromNow(30);
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
      createdAt: savedAt,
    });

    await captureEditorSaves({
      now: new Date(savedAt.getTime() + EDITOR_SAVE_CAPTURE_CUTOFF_MS + 60_000),
      organizationIds: [organization.id],
    });

    const analyses = await db
      .select({ createdAt: schema.reportingAnalyses.createdAt })
      .from(schema.reportingAnalyses)
      .where(eq(schema.reportingAnalyses.organizationId, organization.id));
    expect(analyses.map((row) => row.createdAt.toISOString())).toEqual([savedAt.toISOString()]);
    const completions = await db
      .select({ createdAt: schema.reportingActivity.createdAt })
      .from(schema.reportingActivity)
      .where(
        and(
          eq(schema.reportingActivity.organizationId, organization.id),
          eq(schema.reportingActivity.kind, "completion"),
        ),
      );
    expect(completions.map((row) => row.createdAt.toISOString())).toEqual([savedAt.toISOString()]);
  });

  it("reads only events after the position when a new save arrives", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    const save = (segmentId: string, createdAt?: Date) =>
      insertSaveEvent({
        organizationId: organization.id,
        projectId: project.id,
        actorUserId: user.id,
        segmentId,
        createdAt,
      });
    await save(keyIds[0]);
    const run = (minutes: number) =>
      captureEditorSaves({ now: minutesFromNow(minutes), organizationIds: [organization.id] });
    expect((await run(3)).eventsProcessed).toBe(1);

    await save(keyIds[1], minutesFromNow(2));
    expect((await run(5)).eventsProcessed).toBe(1);
    expect((await run(5)).eventsProcessed).toBe(0);
  });

  it("counts a repeated string as a repetition when its copies are recorded in different runs", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    const save = (segmentId: string, createdAt?: Date) =>
      insertSaveEvent({
        organizationId: organization.id,
        projectId: project.id,
        actorUserId: user.id,
        segmentId,
        createdAt,
      });
    await save(keyIds[0]);
    await captureEditorSaves({ now: minutesFromNow(3), organizationIds: [organization.id] });
    await save(keyIds[1], minutesFromNow(2));
    await captureEditorSaves({ now: minutesFromNow(5), organizationIds: [organization.id] });

    const analyses = await db
      .select({
        segmentId: schema.reportingAnalyses.segmentId,
        bucket: schema.reportingAnalyses.bucket,
      })
      .from(schema.reportingAnalyses)
      .where(eq(schema.reportingAnalyses.organizationId, organization.id));
    expect(analyses.find((row) => row.segmentId === keyIds[0])?.bucket).not.toBe("repetition");
    expect(analyses.find((row) => row.segmentId === keyIds[1])?.bucket).toBe("repetition");
  });

  it("records an approval made by an agent as automated, not billable, with no person", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
      eventType: "string_segment_approved",
      actorKind: "agent",
    });

    await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });

    const [analysis] = await db
      .select({ id: schema.reportingAnalyses.id, billable: schema.reportingAnalyses.billable })
      .from(schema.reportingAnalyses)
      .where(eq(schema.reportingAnalyses.organizationId, organization.id));
    expect(analysis.billable).toBe(false);
    const activity = await db
      .select({
        kind: schema.reportingActivity.kind,
        actorUserId: schema.reportingActivity.actorUserId,
      })
      .from(schema.reportingActivity)
      .where(eq(schema.reportingActivity.organizationId, organization.id));
    expect(activity).toEqual([{ kind: "completion", actorUserId: null }]);
    const costs = await db
      .select({ id: schema.reportingCosts.id })
      .from(schema.reportingCosts)
      .where(eq(schema.reportingCosts.organizationId, organization.id));
    expect(costs).toEqual([]);
  });

  it("attributes a save to the open task for people that covers its file, language and step", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    const task = await createProofreadTask({
      organizationId: organization.id,
      projectId: project.id,
      userId: user.id,
    });

    // An approval is the proofread task's work, and so is an edit made while it covers the file:
    // the reviewer's edit counts as the task's review work, not as translation work on the job
    // that produced the text. A later approval of the edited string adds no second completion.
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
      eventType: "string_segment_approved",
      nextStatus: "approved",
    });
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[1],
    });
    await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[1],
      eventType: "string_segment_approved",
      nextStatus: "approved",
      createdAt: minutesFromNow(1),
    });
    await captureEditorSaves({ now: minutesFromNow(10), organizationIds: [organization.id] });

    const completions = await db
      .select({
        jobId: schema.reportingActivity.jobId,
        step: schema.reportingActivity.step,
        segmentId: schema.reportingAnalyses.segmentId,
        unchanged: schema.reportingActivity.unchanged,
      })
      .from(schema.reportingActivity)
      .innerJoin(
        schema.reportingAnalyses,
        eq(schema.reportingAnalyses.id, schema.reportingActivity.analysisId),
      )
      .where(
        and(
          eq(schema.reportingActivity.organizationId, organization.id),
          eq(schema.reportingActivity.kind, "completion"),
        ),
      );
    expect(completions).toHaveLength(2);
    for (const segmentId of keyIds)
      expect(completions.find((row) => row.segmentId === segmentId)).toMatchObject({
        jobId: task.id,
        step: "review",
      });
    // The edit, not the approval after it, is what the task's work records for the second string.
    expect(completions.find((row) => row.segmentId === keyIds[1])?.unchanged).toBe(false);
    const analyses = await db
      .select({ jobId: schema.reportingAnalyses.jobId, step: schema.reportingAnalyses.step })
      .from(schema.reportingAnalyses)
      .where(eq(schema.reportingAnalyses.organizationId, organization.id));
    expect(analyses).toHaveLength(2);
    expect(analyses.every((row) => row.jobId === task.id && row.step === "review")).toBe(true);
  });

  it("records an edit as translation work when no task for people covers the string", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
    });
    await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });

    const completions = await db
      .select({ jobId: schema.reportingActivity.jobId, step: schema.reportingActivity.step })
      .from(schema.reportingActivity)
      .where(
        and(
          eq(schema.reportingActivity.organizationId, organization.id),
          eq(schema.reportingActivity.kind, "completion"),
        ),
      );
    expect(completions).toEqual([{ jobId: null, step: "translation" }]);
  });

  it("matches each save in a run to the task open at that save's own time", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    const save = (segmentId: string, createdAt: Date, approve = false) =>
      insertSaveEvent({
        organizationId: organization.id,
        projectId: project.id,
        actorUserId: user.id,
        segmentId,
        createdAt,
        ...(approve
          ? { eventType: "string_segment_approved" as const, nextStatus: "approved" }
          : {}),
      });
    // The run's oldest save comes before the task exists; it must not hide the task from saves
    // made in it later in the same run.
    await save(keyIds[1], minutesFromNow(1));
    const task = await createProofreadTask({
      organizationId: organization.id,
      projectId: project.id,
      userId: user.id,
      createdAt: minutesFromNow(2),
    });
    await save(keyIds[0], minutesFromNow(3), true);
    // Cancelled after that approval, and changed again later: a later approval in the same run
    // is no longer the task's work, judged by when the task ended rather than its last change.
    await db
      .update(schema.jobs)
      .set({ status: "cancelled", completedAt: minutesFromNow(4), updatedAt: minutesFromNow(6) })
      .where(eq(schema.jobs.id, task.id));
    await save(keyIds[1], minutesFromNow(5), true);
    await captureEditorSaves({ now: minutesFromNow(10), organizationIds: [organization.id] });

    const approvals = await db
      .select({
        segmentId: schema.reportingAnalyses.segmentId,
        jobId: schema.reportingAnalyses.jobId,
      })
      .from(schema.reportingAnalyses)
      .where(
        and(
          eq(schema.reportingAnalyses.organizationId, organization.id),
          eq(schema.reportingAnalyses.step, "review"),
        ),
      );
    expect(approvals.find((row) => row.segmentId === keyIds[0])?.jobId).toBe(task.id);
    expect(approvals.find((row) => row.segmentId === keyIds[1])?.jobId).toBeNull();
  });

  it("records where a saved text came from, and whether the person kept it", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    const translations = await db
      .select({
        id: schema.projectTranslations.id,
        keyId: schema.projectTranslations.translationKeyId,
      })
      .from(schema.projectTranslations)
      .where(eq(schema.projectTranslations.projectId, project.id));
    const translationOf = (keyId: string) => translations.find((row) => row.keyId === keyId)!;
    // A task wrote both strings; the person kept the first and rewrote the second.
    for (const [keyId, given] of [
      [keyIds[0], "Bonjour le monde"],
      [keyIds[1], "Salut tout le monde"],
    ] as const) {
      await db.insert(schema.projectTranslationRevisions).values({
        organizationId: organization.id,
        projectId: project.id,
        translationId: translationOf(keyId).id,
        translationKeyId: keyId,
        targetLocale: "fr-FR",
        text: given,
        status: "draft",
        provenance: "translation_job",
        actorKind: "agent",
        createdAt: minutesFromNow(-10),
      });
    }
    // The rewrite is a version of its own in the editor's history, as every save of a person is.
    await db.insert(schema.projectTranslationRevisions).values({
      organizationId: organization.id,
      projectId: project.id,
      translationId: translationOf(keyIds[1]).id,
      translationKeyId: keyIds[1],
      targetLocale: "fr-FR",
      text: "Bonjour le monde",
      status: "draft",
      provenance: "manual",
      actorKind: "user",
      actorUserId: user.id,
      createdAt: minutesFromNow(-5),
    });
    for (const segmentId of keyIds) {
      await insertSaveEvent({
        organizationId: organization.id,
        projectId: project.id,
        actorUserId: user.id,
        segmentId,
        eventType: "string_segment_approved",
        nextStatus: "approved",
      });
    }
    await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });

    const completions = await db
      .select({
        analysisId: schema.reportingActivity.analysisId,
        source: schema.reportingActivity.source,
        unchanged: schema.reportingActivity.unchanged,
      })
      .from(schema.reportingActivity)
      .innerJoin(
        schema.reportingAnalyses,
        eq(schema.reportingAnalyses.id, schema.reportingActivity.analysisId),
      )
      .where(
        and(
          eq(schema.reportingActivity.organizationId, organization.id),
          eq(schema.reportingActivity.kind, "completion"),
        ),
      )
      .orderBy(schema.reportingAnalyses.segmentId);
    const bySegment = new Map(
      completions.map((row, index) => [[...keyIds].sort()[index], row] as const),
    );
    expect(bySegment.get(keyIds[0])).toMatchObject({ source: "ai", unchanged: true });
    expect(bySegment.get(keyIds[1])).toMatchObject({ source: "person", unchanged: false });
  });

  it("judges whether a person kept the text by the version they saved, not the text now", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    const translations = await db
      .select({
        id: schema.projectTranslations.id,
        keyId: schema.projectTranslations.translationKeyId,
      })
      .from(schema.projectTranslations)
      .where(eq(schema.projectTranslations.projectId, project.id));
    const revision = async (
      keyId: string,
      text: string,
      actor: "agent" | "user",
      minutes: number,
      status: "draft" | "approved" = "draft",
    ) => {
      const [row] = await db
        .insert(schema.projectTranslationRevisions)
        .values({
          organizationId: organization.id,
          projectId: project.id,
          translationId: translations.find((row) => row.keyId === keyId)!.id,
          translationKeyId: keyId,
          targetLocale: "fr-FR",
          text,
          status,
          provenance: actor === "agent" ? "translation_job" : "manual",
          actorKind: actor,
          createdAt: minutesFromNow(minutes),
        })
        .returning({ id: schema.projectTranslationRevisions.id });
      return row!.id;
    };
    // A task wrote the first string; the person rewrote it; a later run of the task put its own
    // text back, which is the text now ("Bonjour le monde"). Judged against the text now, the
    // person's save would look like the task's text kept unchanged.
    await revision(keyIds[0], "Bonjour le monde", "agent", 1);
    const rewrite = await revision(keyIds[0], "Salut", "user", 2);
    await revision(keyIds[0], "Bonjour le monde", "agent", 3);
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
      createdAt: minutesFromNow(2),
      extraPayload: { revisionId: rewrite },
    });
    // The second string was approved as the task wrote it, then overwritten by the later run. An
    // approval names no version, so the version at its time is the one judged.
    await revision(keyIds[1], "Salut tout le monde", "agent", 1);
    await revision(keyIds[1], "Salut tout le monde", "user", 2, "approved");
    await revision(keyIds[1], "Bonjour le monde", "agent", 3);
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[1],
      eventType: "string_segment_approved",
      nextStatus: "approved",
      createdAt: minutesFromNow(2),
    });
    await captureEditorSaves({ now: minutesFromNow(10), organizationIds: [organization.id] });

    const completions = await db
      .select({
        segmentId: schema.reportingAnalyses.segmentId,
        source: schema.reportingActivity.source,
        unchanged: schema.reportingActivity.unchanged,
      })
      .from(schema.reportingActivity)
      .innerJoin(
        schema.reportingAnalyses,
        eq(schema.reportingAnalyses.id, schema.reportingActivity.analysisId),
      )
      .where(
        and(
          eq(schema.reportingActivity.organizationId, organization.id),
          eq(schema.reportingActivity.kind, "completion"),
        ),
      );
    expect(completions.find((row) => row.segmentId === keyIds[0])).toMatchObject({
      source: "person",
      unchanged: false,
    });
    expect(completions.find((row) => row.segmentId === keyIds[1])).toMatchObject({
      source: "ai",
      unchanged: true,
    });
  });

  it("records an approval as the review step", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
      eventType: "string_segment_approved",
    });

    await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });

    const analyses = await db
      .select({ step: schema.reportingAnalyses.step })
      .from(schema.reportingAnalyses)
      .where(eq(schema.reportingAnalyses.organizationId, organization.id));
    expect(analyses).toEqual([{ step: "review" }]);
  });

  it("leaves events younger than the cutoff for the next run", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
    });

    const result = await captureEditorSaves({
      now: new Date(),
      organizationIds: [organization.id],
    });
    expect(result.eventsProcessed).toBe(0);
    const analyses = await db
      .select()
      .from(schema.reportingAnalyses)
      .where(eq(schema.reportingAnalyses.organizationId, organization.id));
    expect(analyses).toHaveLength(0);
  });

  it("stops before a new batch once the time is up, keeping the batches it finished", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    const saves = [];
    for (const segmentId of keyIds) {
      saves.push(
        await insertSaveEvent({
          organizationId: organization.id,
          projectId: project.id,
          actorUserId: user.id,
          segmentId,
        }),
      );
    }
    // Not aborted for the workspace and its first batch (one memory pass, one group), then aborted
    // when the second batch starts its memory pass.
    let checks = 0;
    const signal = {
      get aborted() {
        checks += 1;
        return checks > 3;
      },
    } as AbortSignal;

    const stopped = await captureEditorSaves({
      now: minutesFromNow(3),
      organizationIds: [organization.id],
      signal,
      eventsPerBatch: 1,
    });
    expect(stopped).toMatchObject({ stopped: "time_budget", eventsProcessed: 1 });
    expect((await positionOf(organization.id)).lastEventId).toBe(saves[0].id);

    const resumed = await captureEditorSaves({
      now: minutesFromNow(3),
      organizationIds: [organization.id],
    });
    expect(resumed).toMatchObject({ stopped: null, eventsProcessed: 1 });
  });

  it("stops between groups once the time is up, and records the whole batch next run", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
    });
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[1],
      eventType: "string_segment_approved",
    });
    const before = await positionOf(organization.id);
    // Not aborted for the workspace, the batch's memory pass and its first group; aborted at the
    // second group (translation and review are separate groups).
    let checks = 0;
    const signal = {
      get aborted() {
        checks += 1;
        return checks > 3;
      },
    } as AbortSignal;

    const stopped = await captureEditorSaves({
      now: minutesFromNow(3),
      organizationIds: [organization.id],
      signal,
    });
    expect(stopped).toMatchObject({ stopped: "time_budget", eventsProcessed: 0 });
    expect(await positionOf(organization.id)).toEqual(before);

    const resumed = await captureEditorSaves({
      now: minutesFromNow(3),
      organizationIds: [organization.id],
    });
    expect(resumed).toMatchObject({ stopped: null, eventsProcessed: 2, segmentsRecorded: 2 });
  });

  it("does nothing when the time is already up", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
    });

    const result = await captureEditorSaves({
      now: LATER(),
      organizationIds: [organization.id],
      signal: AbortSignal.abort(),
    });
    expect(result).toMatchObject({ stopped: "time_budget", eventsProcessed: 0 });
    expect(mocks.readWorkosFeatureFlag).not.toHaveBeenCalled();
  });

  it("passes over saves made while Reports is off, then records later ones once it is on", async () => {
    mocks.readWorkosFeatureFlag.mockResolvedValue(false);
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    const save = (segmentId: string, createdAt?: Date) =>
      insertSaveEvent({
        organizationId: organization.id,
        projectId: project.id,
        actorUserId: user.id,
        segmentId,
        createdAt,
      });
    const recordedSegments = async () =>
      (
        await db
          .select({ segmentId: schema.reportingAnalyses.segmentId })
          .from(schema.reportingAnalyses)
          .where(eq(schema.reportingAnalyses.organizationId, organization.id))
      ).map((row) => row.segmentId);
    await save(keyIds[0]);

    const off = await captureEditorSaves({
      now: minutesFromNow(3),
      organizationIds: [organization.id],
    });
    expect(off.organizationsSkipped).toBe(1);
    expect(await recordedSegments()).toEqual([]);
    expect(await positionOf(organization.id)).toBeUndefined();

    mocks.readWorkosFeatureFlag.mockResolvedValue(true);
    const started = await captureEditorSaves({
      now: minutesFromNow(3),
      organizationIds: [organization.id],
    });
    expect(started.organizationsStarted).toBe(1);
    await save(keyIds[1], minutesFromNow(2));
    await captureEditorSaves({ now: minutesFromNow(5), organizationIds: [organization.id] });
    expect(await recordedSegments()).toEqual([keyIds[1]]);
  });

  it("stops without moving any position when the feature flags are not downloaded", async () => {
    mocks.waitForWorkosFeatureFlags.mockRejectedValue(new Error("waitUntilReady timed out"));
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
    });

    const before = await positionOf(organization.id);
    const result = await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    expect(result.stopped).toBe("flags_unavailable");
    expect(mocks.readWorkosFeatureFlag).not.toHaveBeenCalled();
    expect(await positionOf(organization.id)).toEqual(before);

    mocks.waitForWorkosFeatureFlags.mockResolvedValue(true);
    const retry = await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    expect(retry.segmentsRecorded).toBe(1);
  });

  it("keeps a workspace's position when its flag check fails, and records on the next run", async () => {
    mocks.readWorkosFeatureFlag.mockRejectedValue(new Error("flag evaluation failed"));
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
    });

    const before = await positionOf(organization.id);
    const failed = await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    expect(failed.segmentsRecorded).toBe(0);
    expect(failed.organizationsSkipped).toBe(0);
    expect(await positionOf(organization.id)).toEqual(before);

    mocks.readWorkosFeatureFlag.mockResolvedValue(true);
    const retry = await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    expect(retry.segmentsRecorded).toBe(1);
  });

  it("treats every workspace as Reports off when WorkOS flags are not configured", async () => {
    mocks.waitForWorkosFeatureFlags.mockResolvedValue(false);
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
    });

    const result = await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    expect(result).toMatchObject({ organizationsSkipped: 1, segmentsRecorded: 0 });
    expect(mocks.readWorkosFeatureFlag).not.toHaveBeenCalled();
  });

  it("starts a workspace it has not seen at the cut-off, without recording earlier saves", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    await db
      .delete(schema.reportingCaptureCursors)
      .where(eq(schema.reportingCaptureCursors.organizationId, organization.id));
    const save = (segmentId: string, createdAt?: Date) =>
      insertSaveEvent({
        organizationId: organization.id,
        projectId: project.id,
        actorUserId: user.id,
        segmentId,
        createdAt,
      });
    await save(keyIds[0]);

    const now = minutesFromNow(3);
    const first = await captureEditorSaves({ now, organizationIds: [organization.id] });
    expect(first).toMatchObject({ organizationsStarted: 1, segmentsRecorded: 0 });
    expect((await positionOf(organization.id)).lastEventCreatedAt).toEqual(
      new Date(now.getTime() - EDITOR_SAVE_CAPTURE_CUTOFF_MS),
    );

    await save(keyIds[1], minutesFromNow(2));
    const next = await captureEditorSaves({
      now: minutesFromNow(5),
      organizationIds: [organization.id],
    });
    expect(next.segmentsRecorded).toBe(1);
  });

  it("passes over an approval made in an external tool and records the saves around it", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: "1001",
      eventType: "string_segment_approved",
    });
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
    });

    const result = await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    expect(result).toMatchObject({ eventsProcessed: 2, segmentsRecorded: 1, stopped: null });
    const again = await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    expect(again).toMatchObject({ eventsProcessed: 0, lateApprovalsRecorded: 0 });
  });

  it("passes over restored versions and undone operations", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
      extraPayload: { restoredFromRevisionId: "00000000-0000-4000-8000-000000000001" },
    });
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[1],
      extraPayload: { operationId: "undo:00000000-0000-4000-8000-000000000002" },
    });

    const result = await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    expect(result).toMatchObject({ eventsProcessed: 2, segmentsRecorded: 0, stopped: null });
  });

  it("moves a workspace's position up to each run's cut-off, even without saves", async () => {
    const { organization } = await projectFixture.createStoredProjectFixture();

    for (const minutes of [0, 15]) {
      const now = minutesFromNow(minutes);
      await captureEditorSaves({ now, organizationIds: [organization.id] });
      expect((await positionOf(organization.id)).lastEventCreatedAt).toEqual(
        new Date(now.getTime() - EDITOR_SAVE_CAPTURE_CUTOFF_MS),
      );
    }
  });

  it("records an approval that reached the activity log after the run that passed it", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    await captureEditorSaves({ now: minutesFromNow(3), organizationIds: [organization.id] });
    // Queued approvals carry the time they were queued: this one is dated behind the position.
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
      eventType: "string_segment_approved",
    });
    // One from before the workspace was started is not Reports' to record.
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[1],
      eventType: "string_segment_approved",
      createdAt: minutesFromNow(-60),
    });

    const late = await captureEditorSaves({
      now: minutesFromNow(5),
      organizationIds: [organization.id],
    });
    expect(late.lateApprovalsRecorded).toBe(1);
    const reviews = await db
      .select({ segmentId: schema.reportingAnalyses.segmentId })
      .from(schema.reportingAnalyses)
      .where(
        and(
          eq(schema.reportingAnalyses.organizationId, organization.id),
          eq(schema.reportingAnalyses.step, "review"),
        ),
      );
    expect(reviews).toEqual([{ segmentId: keyIds[0] }]);

    const again = await captureEditorSaves({
      now: minutesFromNow(5),
      organizationIds: [organization.id],
    });
    expect(again.lateApprovalsRecorded).toBe(0);
  });

  it("records a late approval of a revised source text the string had an earlier review of", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    const approve = () =>
      insertSaveEvent({
        organizationId: organization.id,
        projectId: project.id,
        actorUserId: user.id,
        segmentId: keyIds[0],
        eventType: "string_segment_approved",
      });
    await approve();
    const first = await captureEditorSaves({
      now: minutesFromNow(3),
      organizationIds: [organization.id],
    });
    expect(first).toMatchObject({ eventsProcessed: 1, lateApprovalsRecorded: 0 });
    await db
      .update(schema.projectTranslationKeys)
      .set({ sourceText: "Hello brave world", normalizedSourceText: "hello brave world" })
      .where(eq(schema.projectTranslationKeys.id, keyIds[0]));
    await approve();

    const late = await captureEditorSaves({
      now: minutesFromNow(5),
      organizationIds: [organization.id],
    });
    // Only the late approval: the first one was recorded by the run that passed it.
    expect(late.lateApprovalsRecorded).toBe(1);
    const reviews = await db
      .select({ sourceRevision: schema.reportingAnalyses.sourceRevision })
      .from(schema.reportingAnalyses)
      .where(
        and(
          eq(schema.reportingAnalyses.organizationId, organization.id),
          eq(schema.reportingAnalyses.segmentId, keyIds[0]),
          eq(schema.reportingAnalyses.step, "review"),
        ),
      );
    expect(new Set(reviews.map((review) => review.sourceRevision)).size).toBe(2);

    const again = await captureEditorSaves({
      now: minutesFromNow(5),
      organizationIds: [organization.id],
    });
    expect(again.lateApprovalsRecorded).toBe(0);
  });
});
