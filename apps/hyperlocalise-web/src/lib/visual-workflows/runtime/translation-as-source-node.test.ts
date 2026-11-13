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

import { and, desc, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { enqueueFileUploadedActivityMock } = vi.hoisted(() => ({
  enqueueFileUploadedActivityMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/projects/files/source-file-ingest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/projects/files/source-file-ingest")>();
  return { ...actual, enqueueSourceFileIngestAfterUpload: vi.fn(async () => {}) };
});

// Each send is an upload; without this, every upload waits on the activity log's queue.
vi.mock("@/lib/activity-log/file-segment-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/activity-log/file-segment-events")>();
  return { ...actual, enqueueFileUploadedActivity: enqueueFileUploadedActivityMock };
});

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { db, schema } from "@/lib/database/client";
import {
  createRepositorySourceFileVersion,
  createStoredFile,
  ensureRepositorySourceFile,
} from "@/lib/file-storage/records";
import { projectBranchService } from "@/lib/projects/branches/project-branch-service";
import { listTranslationAsSourceReceipts } from "@/lib/projects/files/translation-as-source-sends";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";
import { DOCX_CONTENT_TYPE, readDocxEntries } from "@/lib/translation/ooxml/docx-document";
import { ooxmlFixture } from "@/lib/translation/ooxml/ooxml.fixture";

import type { TranslationAsSourceError } from "@/lib/projects/files/translation-as-source";

import { createDefaultConfig } from "../catalog/node-catalog";
import { visualWorkflowV3DefinitionSchema } from "../schema/definition-schema";
import type { VisualNodeConfig } from "../schema/types";
import { createVisualWorkflowExecutionContext } from "./context";
import { executeVisualWorkflowNode } from "./execute-node";
import { isRefusal, runTranslationAsSourceAction } from "./translation-as-source-node";
import { validateVisualWorkflowV3Definition } from "../validation/validate-workflow-v3";

const SOURCE_PATH = "requests/report.docx";
const PIVOT_LOCALE = "en-US";
const fixture = createAuthTestFixture();

afterEach(async () => {
  await fixture.cleanup();
});

type Project = typeof schema.projects.$inferSelect;

/** A Word file of `project`, read, with every string approved in `locale`. */
async function addWordFile(
  scope: { organizationId: string; userId: string },
  project: Project,
  locale: string,
) {
  const content = await ooxmlFixture("docx-basic");
  const entries = await readDocxEntries(content);
  if (!entries.ok) throw new Error(entries.error.code);
  const sourceFile = await ensureRepositorySourceFile({
    organizationId: scope.organizationId,
    projectId: project.id,
    sourcePath: SOURCE_PATH,
  });
  const storedFile = await createStoredFile({
    organizationId: scope.organizationId,
    projectId: project.id,
    createdByUserId: scope.userId,
    role: "source",
    sourceKind: "repository_file",
    filename: "report.docx",
    contentType: DOCX_CONTENT_TYPE,
    content: Buffer.from(content),
  });
  const version = await createRepositorySourceFileVersion({ storedFile, sourcePath: SOURCE_PATH });
  await db
    .update(schema.repositorySourceFileVersions)
    .set({ ingestState: "ingested" })
    .where(eq(schema.repositorySourceFileVersions.id, version.id));
  await upsertProjectTranslationKeysFromEntries({
    organizationId: scope.organizationId,
    projectId: project.id,
    repositorySourceFileId: sourceFile.id,
    entries: entries.value.map((entry) => ({ ...entry, context: entry.context ?? null })),
  });
  const keys = await db
    .select()
    .from(schema.projectTranslationKeys)
    .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id));
  await db.insert(schema.projectTranslations).values(
    keys.map((key) => ({
      organizationId: scope.organizationId,
      projectId: project.id,
      translationKeyId: key.id,
      targetLocale: locale,
      text: `Translated ${key.key}`,
      status: "approved" as const,
      provenance: "import" as const,
    })),
  );
  return { storedFile, keys, sourceFileId: sourceFile.id };
}

/** A finished Proofread task on `storedFileId`, as Assign task creates them. */
async function finishedTask(
  scope: { organizationId: string; userId: string },
  projectId: string,
  inputPayload: Record<string, unknown>,
) {
  const [job] = await db
    .insert(schema.jobs)
    .values({
      id: `job_${randomUUID()}`,
      organizationId: scope.organizationId,
      projectId,
      createdByUserId: scope.userId,
      kind: "proofread",
      status: "succeeded",
      inputPayload: { sourceLocale: "zh-CN", targetLocales: [PIVOT_LOCALE], ...inputPayload },
    })
    .returning();
  return job!.id;
}

/**
 * A Chinese project with an approved Word file and a finished task on it, and an English project
 * that can take it.
 */
async function chainedProjects() {
  const { user, organization } = await syncWorkosIdentity(
    db,
    fixture.createWorkosIdentityWithRole("admin"),
  );
  const scope = { organizationId: organization.id, userId: user.id };
  const insertProject = async (values: {
    name: string;
    sourceLocale: string;
    targetLocales: string[];
  }) => {
    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        identifier: uniqueTestProjectIdentifier(),
        organizationId: organization.id,
        createdByUserId: user.id,
        ...values,
      })
      .returning();
    return project!;
  };
  const original = await insertProject({
    name: "Requests (Chinese)",
    sourceLocale: "zh-CN",
    targetLocales: [PIVOT_LOCALE],
  });
  const destination = await insertProject({
    name: "Requests (English)",
    sourceLocale: PIVOT_LOCALE,
    targetLocales: ["de-DE", "zh-CN"],
  });
  const file = await addWordFile(scope, original, PIVOT_LOCALE);
  const task = (inputPayload: Record<string, unknown>, projectId = original.id) =>
    finishedTask(scope, projectId, inputPayload);
  const jobId = await task({ sourceFileId: file.storedFile.id });
  const step = (overrides: Partial<Parameters<typeof runTranslationAsSourceAction>[0]> = {}) =>
    runTranslationAsSourceAction({
      organizationId: organization.id,
      jobId,
      destinationProjectId: destination.id,
      ...overrides,
    });
  const destinationVersions = () =>
    db
      .select({
        id: schema.repositorySourceFileVersions.id,
        uploadedByUserId: schema.repositorySourceFileVersions.uploadedByUserId,
        metadata: schema.storedFiles.metadata,
      })
      .from(schema.repositorySourceFileVersions)
      .innerJoin(
        schema.storedFiles,
        eq(schema.storedFiles.id, schema.repositorySourceFileVersions.storedFileId),
      )
      .where(eq(schema.repositorySourceFileVersions.projectId, destination.id))
      .orderBy(desc(schema.repositorySourceFileVersions.createdAt));
  return {
    scope,
    original,
    destination,
    file,
    jobId,
    task,
    step,
    destinationVersions,
    insertProject,
  };
}

describe("Use translation as source step", () => {
  it("sorts send problems a person must act on from those where nothing should be sent", () => {
    const actOn: TranslationAsSourceError["code"][] = [
      "translations_not_approved",
      "destination_file_replaced",
      "destination_branch_protected",
      "source_file_not_ready",
      "source_file_read_failed",
      "file_reads_differently",
      "file_cannot_be_written",
      "file_build_failed",
      "upload_failed",
      "same_project",
      "project_not_native",
      "locale_not_a_target",
      "destination_source_locale_mismatch",
    ];
    const nothingToSend: TranslationAsSourceError["code"][] = [
      "source_file_not_found",
      "unsupported_file_format",
      "no_strings",
    ];
    expect(actOn.filter(isRefusal)).toEqual([]);
    expect(nothingToSend.every(isRefusal)).toBe(true);
  });

  const sendWorkflow = (trigger: Record<string, unknown>, send: Record<string, unknown> = {}) =>
    visualWorkflowV3DefinitionSchema.parse({
      schemaVersion: 3,
      name: "Send when a task is done",
      nodes: [
        {
          id: "trigger",
          type: "trigger.job_changed",
          config: { kind: "trigger.job_changed", eventTypes: ["job.status_changed"], ...trigger },
        },
        {
          id: "send",
          type: "action.translation_as_source",
          config: {
            ...createDefaultConfig("action.translation_as_source"),
            destinationProjectId: "project_en",
            onError: "branch",
            ...send,
          },
        },
        {
          id: "notify",
          type: "action.notify_slack",
          config: {
            kind: "action.notify_slack",
            channelId: "C0123456789",
            message: "{{ nodes.send.error.code }}: {{ nodes.send.error.message }}",
          },
        },
      ],
      edges: [
        {
          id: "e1",
          kind: "execution",
          source: "trigger",
          target: "send",
          sourcePortId: "success",
          targetPortId: "input",
        },
        {
          id: "e2",
          kind: "execution",
          source: "send",
          target: "notify",
          sourcePortId: "error",
          targetPortId: "input",
        },
      ],
      editor: { positions: {} },
    });

  it("accepts a later step that reads its error on the error branch", () => {
    expect(validateVisualWorkflowV3Definition(sendWorkflow({ projectId: "project_zh" }))).toEqual(
      [],
    );
  });

  it("asks for the trigger's project unless the step is meant for any project", () => {
    expect(validateVisualWorkflowV3Definition(sendWorkflow({}))).toEqual([
      { code: "trigger_project_required", nodeId: "trigger", field: "projectId" },
    ]);
    expect(validateVisualWorkflowV3Definition(sendWorkflow({}, { allowAnyProject: true }))).toEqual(
      [],
    );
  });

  it("asks for the project to send to", () => {
    expect(
      validateVisualWorkflowV3Definition(
        sendWorkflow({ projectId: "project_zh" }, { destinationProjectId: "" }),
      ),
    ).toEqual([
      {
        code: "invalid_node_config",
        nodeId: "send",
        field: "destinationProjectId",
        reason: "required",
      },
    ]);
  });

  it("asks for the project while any send step still means one project", () => {
    const definition = sendWorkflow({}, { allowAnyProject: true });
    definition.nodes.push({
      ...definition.nodes[1]!,
      id: "send_again",
      config: {
        ...(createDefaultConfig("action.translation_as_source") as Extract<
          VisualNodeConfig,
          { kind: "action.translation_as_source" }
        >),
        destinationProjectId: "project_en",
      },
    });
    definition.edges.push({
      id: "e3",
      kind: "execution",
      source: "trigger",
      target: "send_again",
      sourcePortId: "success",
      targetPortId: "input",
    });
    expect(validateVisualWorkflowV3Definition(definition)).toContainEqual({
      code: "trigger_project_required",
      nodeId: "trigger",
      field: "projectId",
    });
  });

  it("sends the file once with no person behind it, then finds it already sent", async () => {
    const chained = await chainedProjects();

    const first = await chained.step();
    expect(first).toEqual({
      ok: true,
      output: {
        sent: true,
        destinationProjectId: chained.destination.id,
        path: SOURCE_PATH,
        sourceFileVersionId: expect.any(String),
        stringCount: chained.file.keys.length,
      },
    });
    const [version] = await chained.destinationVersions();
    expect(version?.uploadedByUserId).toBeNull();
    expect(version?.metadata).toMatchObject({
      translationSource: { projectId: chained.original.id, sentAutomatically: true },
    });
    expect(
      await listTranslationAsSourceReceipts({
        organizationId: chained.scope.organizationId,
        projectId: chained.destination.id,
      }),
    ).toMatchObject([{ sourcePath: SOURCE_PATH, sentAutomatically: true }]);

    expect(await chained.step()).toMatchObject({
      ok: true,
      output: { sent: false, reason: "already_sent" },
    });
    expect(await chained.destinationVersions()).toHaveLength(1);
  });

  it("fails, saying how many strings wait for approval, so the run can be retried", async () => {
    const chained = await chainedProjects();
    await db
      .update(schema.projectTranslations)
      .set({ status: "needs_review" })
      .where(eq(schema.projectTranslations.translationKeyId, chained.file.keys[0]!.id));

    expect(await chained.step()).toEqual({
      ok: false,
      error: {
        code: "translations_not_approved",
        message: `1 string has no approved translation in ${PIVOT_LOCALE}. Approve it, then retry the run or send the file from the Files page.`,
      },
    });
    expect(await chained.destinationVersions()).toHaveLength(0);
  });

  it("never replaces a file there that it did not send", async () => {
    const chained = await chainedProjects();
    const byHand = await createStoredFile({
      organizationId: chained.scope.organizationId,
      projectId: chained.destination.id,
      role: "source",
      sourceKind: "repository_file",
      filename: "report.docx",
      contentType: DOCX_CONTENT_TYPE,
      content: Buffer.from("uploaded by hand"),
    });
    await createRepositorySourceFileVersion({
      storedFile: byHand,
      sourcePath: SOURCE_PATH,
      uploadSurface: "files_page",
    });

    expect(await chained.step()).toMatchObject({
      ok: false,
      error: { code: "destination_file_replaced" },
    });
    expect(await chained.destinationVersions()).toHaveLength(1);
  });

  it("does not send a file back to the project its content came from", async () => {
    const chained = await chainedProjects();
    expect(await chained.step()).toMatchObject({ ok: true, output: { sent: true } });
    const [sentVersion] = await chained.destinationVersions();
    const [sentStored] = await db
      .select({ storedFileId: schema.repositorySourceFileVersions.storedFileId })
      .from(schema.repositorySourceFileVersions)
      .where(eq(schema.repositorySourceFileVersions.id, sentVersion!.id));

    const backTask = await chained.task(
      {
        sourceLocale: PIVOT_LOCALE,
        targetLocales: ["zh-CN"],
        sourceFileId: sentStored!.storedFileId,
      },
      chained.destination.id,
    );

    expect(
      await chained.step({ jobId: backTask, destinationProjectId: chained.original.id }),
    ).toMatchObject({ ok: true, output: { sent: false, reason: "sent_from_destination" } });
  });

  it("fails on a setting that cannot work", async () => {
    const chained = await chainedProjects();
    const french = await chained.insertProject({
      name: "Website",
      sourceLocale: "fr-FR",
      targetLocales: ["de-DE"],
    });

    expect(await chained.step({ destinationProjectId: "" })).toMatchObject({
      ok: false,
      error: { code: "missing_translation_as_source_config" },
    });
    expect(await chained.step({ jobId: "" })).toMatchObject({
      ok: false,
      error: { code: "missing_translation_as_source_config" },
    });
    // A task in another language is skipped first, so a trigger on any project stays quiet.
    expect(await chained.step({ destinationProjectId: french.id })).toMatchObject({
      ok: true,
      output: { sent: false, reason: "task_in_other_language" },
    });
    expect(
      await chained.step({
        jobId: await chained.task({
          targetLocales: ["fr-FR"],
          sourceFileId: chained.file.storedFile.id,
        }),
        destinationProjectId: french.id,
      }),
    ).toMatchObject({ ok: false, error: { code: "destination_source_locale_mismatch" } });
    expect(
      await chained.step({
        jobId: await chained.task({
          targetLocales: ["zh-CN"],
          sourceFileId: chained.file.storedFile.id,
        }),
        destinationProjectId: chained.original.id,
      }),
    ).toMatchObject({ ok: false, error: { code: "same_project" } });
    await db
      .update(schema.projects)
      .set({ source: "external_tms", externalProviderKind: "crowdin" })
      .where(eq(schema.projects.id, chained.destination.id));
    expect(await chained.step()).toMatchObject({
      ok: false,
      error: { code: "project_not_native" },
    });
  });

  it("finds its own send when the step is tried again", async () => {
    const chained = await chainedProjects();
    const first = await chained.step({ idempotencyKey: "run-1/translation_as_source/-1" });
    expect(first).toMatchObject({ ok: true, output: { sent: true } });

    expect(await chained.step({ idempotencyKey: "run-1/translation_as_source/-1" })).toEqual({
      ok: true,
      output: {
        sent: true,
        destinationProjectId: chained.destination.id,
        path: SOURCE_PATH,
        sourceFileVersionId: first.ok ? first.output.sourceFileVersionId : undefined,
      },
    });
    expect(await chained.step({ idempotencyKey: "run-2/translation_as_source/-1" })).toMatchObject({
      ok: true,
      output: { sent: false, reason: "already_sent" },
    });
    expect(await chained.destinationVersions()).toHaveLength(1);
  });

  it("reads the task from the Job changed trigger", async () => {
    const chained = await chainedProjects();
    const result = await executeVisualWorkflowNode({
      organizationId: chained.scope.organizationId,
      context: createVisualWorkflowExecutionContext({
        triggerInput: { jobId: chained.jobId, projectId: chained.original.id },
      }),
      node: {
        id: "translation_as_source",
        type: "action.translation_as_source",
        config: {
          ...createDefaultConfig("action.translation_as_source"),
          kind: "action.translation_as_source",
          destinationProjectId: chained.destination.id,
        } as Extract<VisualNodeConfig, { kind: "action.translation_as_source" }>,
      },
    });

    expect(result).toMatchObject({ ok: true, output: { sent: true } });
    expect(
      await db
        .select()
        .from(schema.repositorySourceFileVersions)
        .where(
          and(
            eq(schema.repositorySourceFileVersions.projectId, chained.destination.id),
            eq(schema.repositorySourceFileVersions.sourcePath, SOURCE_PATH),
          ),
        ),
    ).toHaveLength(1);
  });

  it("sends nothing for a task with no file, in another language, or whose file is gone", async () => {
    const chained = await chainedProjects();
    const byTask = async (inputPayload: Record<string, unknown>) =>
      chained.step({ jobId: await chained.task(inputPayload) });

    expect(await byTask({ sourceFileId: undefined })).toMatchObject({
      ok: true,
      output: { sent: false, reason: "task_has_no_file" },
    });
    expect(
      await byTask({ targetLocales: ["fr-FR"], sourceFileId: chained.file.storedFile.id }),
    ).toMatchObject({ ok: true, output: { sent: false, reason: "task_in_other_language" } });
    expect(await byTask({ sourceFileId: randomUUID() })).toMatchObject({
      ok: true,
      output: { sent: false, reason: "source_file_not_found" },
    });
    expect(await chained.step({ jobId: `job_${randomUUID()}` })).toMatchObject({
      ok: false,
      error: { code: "job_not_found" },
    });
    expect(await chained.destinationVersions()).toHaveLength(0);
  });

  it("sends the default branch's file, and nothing from another branch", async () => {
    const chained = await chainedProjects();
    // A branch copy shares the file's stored file, as a branch made from main does.
    const onBranch = await ensureRepositorySourceFile({
      organizationId: chained.scope.organizationId,
      projectId: chained.original.id,
      sourcePath: SOURCE_PATH,
      branchName: "release-2026",
    });
    await db.insert(schema.repositorySourceFileVersions).values({
      organizationId: chained.scope.organizationId,
      projectId: chained.original.id,
      repositorySourceFileId: onBranch.id,
      sourcePath: SOURCE_PATH,
      storedFileId: chained.file.storedFile.id,
      ingestState: "ingested",
    });
    expect(await chained.step()).toMatchObject({ ok: true, output: { sent: true } });

    const branchOnly = await createStoredFile({
      organizationId: chained.scope.organizationId,
      projectId: chained.original.id,
      role: "source",
      sourceKind: "repository_file",
      filename: "notes.docx",
      contentType: DOCX_CONTENT_TYPE,
      content: Buffer.from("only on a branch"),
    });
    await createRepositorySourceFileVersion({
      storedFile: branchOnly,
      sourcePath: "requests/notes.docx",
      branchName: "release-2026",
    });
    expect(
      await chained.step({ jobId: await chained.task({ sourceFileId: branchOnly.id }) }),
    ).toMatchObject({
      ok: true,
      output: { sent: false, reason: "not_on_default_branch" },
    });
  });

  it("fails when the other project's default branch is protected", async () => {
    const chained = await chainedProjects();
    const branch = await projectBranchService.ensureDefaultBranch({
      organizationId: chained.scope.organizationId,
      projectId: chained.destination.id,
    });
    await db
      .update(schema.projectBranches)
      .set({ isProtected: true })
      .where(eq(schema.projectBranches.id, branch.id));

    expect(await chained.step()).toMatchObject({
      ok: false,
      error: { code: "destination_branch_protected" },
    });
    expect(await chained.destinationVersions()).toHaveLength(0);
  });
});
