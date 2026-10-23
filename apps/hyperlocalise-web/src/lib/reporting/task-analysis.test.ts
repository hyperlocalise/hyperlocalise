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

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { insertStoredSourceFile } from "@/api/routes/public-jobs/public-jobs.fixture";
import { db, schema } from "@/lib/database/client";
import { ensureRepositorySourceFile } from "@/lib/file-storage/records";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";

import { analyseTaskStrings, openPersonTaskForString } from "./task-analysis";

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
    expect(await analyseTaskStrings(input)).toBe(2);
    // Running again, as a retried step would, adds nothing.
    expect(await analyseTaskStrings(input)).toBe(2);

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

    // A task that ended covers nothing more; the older open one takes over.
    await db.update(schema.jobs).set({ status: "succeeded" }).where(eq(schema.jobs.id, newer.id));
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
});
