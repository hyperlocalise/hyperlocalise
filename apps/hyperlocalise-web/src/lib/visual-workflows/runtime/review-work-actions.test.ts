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

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { insertStoredSourceFile } from "@/api/routes/public-jobs/public-jobs.fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";

import {
  MAX_LISTED_REVIEW_WORK,
  runListReviewWorkAction,
  type ReviewWorkItem,
} from "./review-work-actions";

const fixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

type Status = NonNullable<(typeof schema.projectTranslations.$inferInsert)["status"]>;

/** A project translated into French and German, with helpers to add files, strings and tasks. */
async function setUp() {
  const { identity, organization, project } = await fixture.createStoredProjectFixture();
  const ownerId = await fixture.getLocalUserId(identity.user.workosUserId);
  await db
    .update(schema.projects)
    .set({ targetLocales: ["fr-FR", "de-DE"] })
    .where(eq(schema.projects.id, project.id));
  const scope = { organizationId: organization.id, projectId: project.id };
  const versionByStoredFile = new Map<string, string>();

  async function addFile(sourcePath: string, branchName = "main") {
    const stored = await insertStoredSourceFile({
      ...scope,
      filename: sourcePath.split("/").at(-1),
      contentType: "application/json",
      sourceKind: "repository_file",
    });
    const [file] = await db
      .insert(schema.repositorySourceFiles)
      .values({ ...scope, sourcePath, branchName })
      .returning({ id: schema.repositorySourceFiles.id });
    const [version] = await db
      .insert(schema.repositorySourceFileVersions)
      .values({ ...scope, repositorySourceFileId: file!.id, sourcePath, storedFileId: stored.id })
      .returning({ id: schema.repositorySourceFileVersions.id });
    versionByStoredFile.set(stored.id, version!.id);
    return { id: file!.id, storedFileId: stored.id, sourcePath, branchName };
  }

  /** Adds one string to a file with a translation per language given. */
  async function addString(
    file: Awaited<ReturnType<typeof addFile>>,
    translations: Record<string, Status | { status: Status; text: string }>,
    options: { hidden?: boolean } = {},
  ) {
    const [key] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        ...scope,
        repositorySourceFileId: file.id,
        branchName: file.branchName,
        key: `key_${randomUUID()}`,
        sourceText: "Hello",
        normalizedSourceText: "hello",
        isHidden: options.hidden ?? false,
      })
      .returning({ id: schema.projectTranslationKeys.id });
    for (const [targetLocale, value] of Object.entries(translations)) {
      const { status, text } =
        typeof value === "string" ? { status: value, text: "Bonjour" } : value;
      await db
        .insert(schema.projectTranslations)
        .values({ ...scope, translationKeyId: key!.id, targetLocale, text, status });
    }
  }

  async function addTask(
    file: Awaited<ReturnType<typeof addFile>>,
    input: Partial<{
      status: (typeof schema.jobs.$inferInsert)["status"];
      kind: (typeof schema.jobs.$inferInsert)["kind"];
      assigneeType: (typeof schema.jobs.$inferInsert)["assigneeType"];
      targetLocales: string[] | null;
      afterJobId: string;
      /** False for a task on chosen strings, which names no file. */
      onFile: boolean;
    }> = {},
  ) {
    const [job] = await db
      .insert(schema.jobs)
      .values({
        id: `job_${randomUUID()}`,
        ...scope,
        ownerUserId: ownerId,
        assigneeType: input.assigneeType ?? "user",
        kind: input.kind ?? "proofread",
        status: input.status ?? "waiting_for_review",
        afterJobId: input.afterJobId ?? null,
        inputPayload: {
          ...(input.onFile === false ? {} : { sourceFileId: file.storedFileId }),
          sourceLocale: "en-US",
          ...(input.targetLocales === null
            ? {}
            : { targetLocales: input.targetLocales ?? ["fr-FR"] }),
        },
      })
      .returning({ id: schema.jobs.id });
    await db.insert(schema.translationJobDetails).values({
      jobId: job!.id,
      type: input.onFile === false ? "keys" : "file",
      sourceFileVersionId: versionByStoredFile.get(file.storedFileId) ?? null,
    });
    return job!.id;
  }

  async function list(pathPrefix = "") {
    const result = await runListReviewWorkAction({ ...scope, pathPrefix });
    if (!result.ok) throw new Error(`expected a list, got ${result.error.code}`);
    const output = result.output as { items: ReviewWorkItem[]; count: number; truncated: boolean };
    return {
      ...output,
      // Easier to read in an assertion: "path locale count".
      lines: output.items.map((item) => `${item.path} ${item.targetLocale} ${item.needsReview}`),
    };
  }

  return { scope, addFile, addString, addTask, list };
}

describe("List work to review", () => {
  it("lists each file and language with translations waiting for review or saved as drafts", async () => {
    const s = await setUp();
    const app = await s.addFile("locales/app.json");
    const emails = await s.addFile("locales/emails.json");
    await s.addString(app, { "fr-FR": "needs_review", "de-DE": "approved" });
    await s.addString(app, { "fr-FR": "draft", "de-DE": "needs_review" });
    await s.addString(emails, { "de-DE": "draft" });

    const listed = await s.list();

    expect(listed.lines).toEqual([
      "locales/app.json de-DE 1",
      "locales/app.json fr-FR 2",
      "locales/emails.json de-DE 1",
    ]);
    expect(listed.count).toBe(3);
    expect(listed.truncated).toBe(false);
    expect(new Set(listed.items.map((item) => item.projectId))).toEqual(
      new Set([s.scope.projectId]),
    );
    // Each item names the file by its upload, which is what Assign task takes.
    expect(listed.items.map((item) => item.sourceFileId)).toEqual([
      app.storedFileId,
      app.storedFileId,
      emails.storedFileId,
    ]);
  });

  it("leaves out what is not review work", async () => {
    const s = await setUp();
    const app = await s.addFile("locales/app.json");
    const onBranch = await s.addFile("locales/app.json", "feature");
    await s.addString(app, { "fr-FR": "approved", "de-DE": "rejected" });
    // An empty draft is an untranslated string, not something to review.
    await s.addString(app, { "fr-FR": { status: "draft", text: "  " } });
    await s.addString(app, { "fr-FR": "needs_review" }, { hidden: true });
    // A language the project no longer has.
    await s.addString(app, { "ja-JP": "needs_review" });
    // A branch's strings join when the branch is merged.
    await s.addString(onBranch, { "fr-FR": "needs_review" });

    expect((await s.list()).lines).toEqual([]);
  });

  it("leaves out a file and language while an open or waiting task covers it", async () => {
    const s = await setUp();
    const app = await s.addFile("locales/app.json");
    const emails = await s.addFile("locales/emails.json");
    await s.addString(app, { "fr-FR": "needs_review", "de-DE": "needs_review" });
    await s.addString(emails, { "fr-FR": "needs_review", "de-DE": "needs_review" });

    const open = await s.addTask(app, { targetLocales: ["fr-FR"] });
    expect((await s.list()).lines).toEqual([
      "locales/app.json de-DE 1",
      "locales/emails.json de-DE 1",
      "locales/emails.json fr-FR 1",
    ]);

    // A task that has not opened yet, because it comes after another, covers its file too.
    await s.addTask(emails, { status: "queued", afterJobId: open, targetLocales: ["de-DE"] });
    expect((await s.list()).lines).toEqual([
      "locales/app.json de-DE 1",
      "locales/emails.json fr-FR 1",
    ]);

    // A task made without languages covers every language of its file.
    await s.addTask(emails, { targetLocales: null });
    expect((await s.list()).lines).toEqual(["locales/app.json de-DE 1"]);
  });

  it("lists a file and language again once its task is finished", async () => {
    const s = await setUp();
    const app = await s.addFile("locales/app.json");
    await s.addString(app, { "fr-FR": "needs_review" });

    for (const status of ["succeeded", "failed", "cancelled"] as const) {
      await s.addTask(app, { status });
    }
    // Jobs that are not a person's review task: an AI proofread, and a translation job.
    await s.addTask(app, { assigneeType: "agent" });
    await s.addTask(app, { kind: "translation", status: "waiting_for_review" });
    // A queued job that waits for nothing is not a waiting task.
    await s.addTask(app, { status: "queued" });
    // A task on chosen strings names no file, so it holds none.
    await s.addTask(app, { onFile: false });
    // A task mirrored from another translation tool is worked there, not here.
    const mirrored = await s.addTask(app);
    await db.insert(schema.externalJobDetails).values({
      jobId: mirrored,
      organizationId: s.scope.organizationId,
      providerKind: "crowdin",
      externalJobId: "42",
      externalStatus: "in_progress",
    });
    // A task waiting for a job that failed never opens by itself.
    const failed = await s.addTask(app, { kind: "translation", status: "failed" });
    await s.addTask(app, { status: "queued", afterJobId: failed });

    expect((await s.list()).lines).toEqual(["locales/app.json fr-FR 1"]);
  });

  it("stops at the most a loop can run and says there is more", async () => {
    const s = await setUp();
    const locales = Array.from({ length: MAX_LISTED_REVIEW_WORK + 1 }, (_, index) => `x-${index}`);
    await db
      .update(schema.projects)
      .set({ targetLocales: locales })
      .where(eq(schema.projects.id, s.scope.projectId));
    const app = await s.addFile("locales/app.json");
    await s.addString(app, Object.fromEntries(locales.map((locale) => [locale, "needs_review"])));

    const listed = await s.list();

    expect(listed.count).toBe(MAX_LISTED_REVIEW_WORK);
    expect(listed.items).toHaveLength(MAX_LISTED_REVIEW_WORK);
    expect(listed.truncated).toBe(true);
  });

  it("leaves out a file that has strings and no upload", async () => {
    const s = await setUp();
    const [bare] = await db
      .insert(schema.repositorySourceFiles)
      .values({ ...s.scope, sourcePath: "locales/bare.json", branchName: "main" })
      .returning({ id: schema.repositorySourceFiles.id });
    await s.addString(
      { id: bare!.id, storedFileId: "", sourcePath: "locales/bare.json", branchName: "main" },
      { "fr-FR": "needs_review" },
    );

    expect((await s.list()).lines).toEqual([]);
  });

  it("keeps to the files under a path", async () => {
    const s = await setUp();
    await s.addString(await s.addFile("locales/app.json"), { "fr-FR": "needs_review" });
    await s.addString(await s.addFile("docs/guide.json"), { "fr-FR": "needs_review" });

    expect((await s.list("locales/")).lines).toEqual(["locales/app.json fr-FR 1"]);
    expect((await s.list("/docs")).lines).toEqual(["docs/guide.json fr-FR 1"]);
  });

  it("names the file by its latest upload", async () => {
    const s = await setUp();
    const app = await s.addFile("locales/app.json");
    await s.addString(app, { "fr-FR": "needs_review" });
    const later = await insertStoredSourceFile({ ...s.scope, filename: "app.json" });
    await db.insert(schema.repositorySourceFileVersions).values({
      ...s.scope,
      repositorySourceFileId: app.id,
      sourcePath: app.sourcePath,
      storedFileId: later.id,
      createdAt: new Date(Date.now() + 60_000),
    });

    expect((await s.list()).items[0]?.sourceFileId).toBe(later.id);
  });

  it("asks for a project, and refuses one from another workspace", async () => {
    const s = await setUp();

    const missing = await runListReviewWorkAction({ ...s.scope, projectId: "", pathPrefix: "" });
    expect(missing.ok ? null : missing.error.code).toBe("missing_review_work_config");

    const other = await runListReviewWorkAction({
      organizationId: randomUUID(),
      projectId: s.scope.projectId,
      pathPrefix: "",
    });
    expect(other.ok ? null : other.error.code).toBe("project_not_found");
  });
});
