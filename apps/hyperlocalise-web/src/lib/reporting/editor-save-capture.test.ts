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

import { and, eq, sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { ensureRepositorySourceFile } from "@/lib/file-storage/records";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";

import { captureEditorSaves, EDITOR_SAVE_CAPTURE_CUTOFF_MS } from "./editor-save-capture";

const mocks = vi.hoisted(() => ({
  // The capture task's own check, per workspace.
  reportsFlagRun: vi.fn(async (): Promise<boolean> => true),
  // The check inside the shared capture functions.
  resolveWorkspaceReportsFlag: vi.fn(async () => true),
  waitForWorkosFeatureFlags: vi.fn(async () => true),
}));

vi.mock("@/lib/flags/workspace-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workspace-flags")>();
  return {
    ...actual,
    workspaceReportsFlag: { run: mocks.reportsFlagRun },
    resolveWorkspaceReportsFlag: mocks.resolveWorkspaceReportsFlag,
  };
});

vi.mock("@/lib/flags/workos-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workos-adapter")>();
  return { ...actual, waitForWorkosFeatureFlags: mocks.waitForWorkosFeatureFlags };
});

const projectFixture = createProjectTestFixture();
const SOURCE_PATH = "locales/en.json";
/** A time well past the capture cutoff, so freshly inserted events count as settled. */
const LATER = () => new Date(Date.now() + EDITOR_SAVE_CAPTURE_CUTOFF_MS + 60_000);

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
  return { organization, project, user, keyIds: keys.map((key) => key.id) };
}

async function insertSaveEvent(input: {
  organizationId: string;
  projectId: string;
  actorUserId: string;
  segmentId: string;
  eventType?: "string_segment_translation_updated" | "string_segment_approved";
  nextStatus?: string;
}) {
  const [event] = await db
    .insert(schema.organizationActivityEvents)
    .values({
      organizationId: input.organizationId,
      actorKind: "user",
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
      },
    })
    .returning({ id: schema.organizationActivityEvents.id });
  return event;
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

  it("reads only events after the cursor when a new save arrives", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    const first = await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
    });
    // A timestamp a JavaScript Date cannot hold exactly, as the database's own times usually are.
    await db.execute(sql`
      update organization_activity_events
      set created_at = date_trunc('milliseconds', created_at) + interval '1 microsecond'
      where id = ${first.id}
    `);
    expect(
      (await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] }))
        .eventsProcessed,
    ).toBe(1);

    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[1],
    });
    expect(
      (await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] }))
        .eventsProcessed,
    ).toBe(1);
  });

  it("counts a repeated string as a repetition when its copies are recorded in different runs", async () => {
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    const save = (segmentId: string) =>
      insertSaveEvent({
        organizationId: organization.id,
        projectId: project.id,
        actorUserId: user.id,
        segmentId,
      });
    await save(keyIds[0]);
    await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    await save(keyIds[1]);
    await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });

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

  it("passes over saves made while Reports is off, then records later ones once it is on", async () => {
    mocks.reportsFlagRun.mockResolvedValue(false);
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    const save = (segmentId: string) =>
      insertSaveEvent({
        organizationId: organization.id,
        projectId: project.id,
        actorUserId: user.id,
        segmentId,
      });
    const recordedSegments = async () =>
      (
        await db
          .select({ segmentId: schema.reportingAnalyses.segmentId })
          .from(schema.reportingAnalyses)
          .where(eq(schema.reportingAnalyses.organizationId, organization.id))
      ).map((row) => row.segmentId);
    const offSave = await save(keyIds[0]);

    const off = await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    expect(off.organizationsSkipped).toBe(1);
    expect(await recordedSegments()).toEqual([]);
    const [cursor] = await db
      .select()
      .from(schema.reportingCaptureCursors)
      .where(eq(schema.reportingCaptureCursors.organizationId, organization.id));
    expect(cursor.lastEventId).toBe(offSave.id);

    mocks.reportsFlagRun.mockResolvedValue(true);
    await save(keyIds[1]);
    await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
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

    const result = await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    expect(result.stopped).toBe("flags_unavailable");
    expect(mocks.reportsFlagRun).not.toHaveBeenCalled();
    const cursors = await db
      .select()
      .from(schema.reportingCaptureCursors)
      .where(eq(schema.reportingCaptureCursors.organizationId, organization.id));
    expect(cursors).toEqual([]);

    mocks.waitForWorkosFeatureFlags.mockResolvedValue(true);
    const retry = await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    expect(retry.segmentsRecorded).toBe(1);
  });

  it("keeps a workspace's position when its flag check fails, and records on the next run", async () => {
    mocks.reportsFlagRun.mockRejectedValue(new Error("organization lookup failed"));
    const { organization, project, user, keyIds } = await createProjectWithSavedOccurrences();
    await insertSaveEvent({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      segmentId: keyIds[0],
    });

    const failed = await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    expect(failed.segmentsRecorded).toBe(0);
    expect(failed.organizationsSkipped).toBe(0);
    const cursors = await db
      .select()
      .from(schema.reportingCaptureCursors)
      .where(eq(schema.reportingCaptureCursors.organizationId, organization.id));
    expect(cursors).toEqual([]);

    mocks.reportsFlagRun.mockResolvedValue(true);
    const retry = await captureEditorSaves({ now: LATER(), organizationIds: [organization.id] });
    expect(retry.segmentsRecorded).toBe(1);
  });

  it("gives a workspace with no saves a position, so later runs skip it cheaply", async () => {
    const { organization } = await projectFixture.createStoredProjectFixture();

    await captureEditorSaves({ now: new Date(), organizationIds: [organization.id] });
    const cursors = await db
      .select()
      .from(schema.reportingCaptureCursors)
      .where(eq(schema.reportingCaptureCursors.organizationId, organization.id));
    expect(cursors).toHaveLength(1);

    mocks.reportsFlagRun.mockClear();
    await captureEditorSaves({ now: new Date(), organizationIds: [organization.id] });
    expect(mocks.reportsFlagRun).not.toHaveBeenCalled();
  });
});
