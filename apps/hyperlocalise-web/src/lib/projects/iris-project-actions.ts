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
import { and, desc, eq, notExists, or, type SQL } from "drizzle-orm";

import { hasCapability } from "@/api/auth/policy";
import { db, schema } from "@/lib/database/client";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { DEFAULT_WORKSPACE_TEAM_SLUG } from "@/lib/teams/default-workspace-team-constants";
import { createStoredFile } from "@/lib/file-storage/records";
import { getFileStorageAdapter } from "@/lib/file-storage/get-file-storage-adapter";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";
import { uploadSourceFile } from "@/lib/projects/files/source-file-upload-service";
import {
  getRepositorySourceFileImportSettings,
  updateRepositorySourceFileImportSettings,
} from "@/lib/projects/files/source-file-import-settings";
import {
  getRepositorySourceFilePlaceholderSettings,
  updateRepositorySourceFilePlaceholderSettings,
} from "@/lib/projects/files/source-file-message-format";
import {
  getRepositorySourceFileSegmentation,
  updateRepositorySourceFileSegmentation,
} from "@/lib/projects/files/source-file-segmentation";
import { loadProjectOfficeTranslationDownload } from "@/lib/projects/files/office-translation-download";
import { loadProjectPdfTranslationDownload } from "@/lib/projects/files/pdf-translation-download";
import { loadProjectSourceFormatTranslationDownload } from "@/lib/projects/files/source-format-translation-download";
import { repositorySourceFileSegmentationSettingsSchema } from "@/lib/projects/files/source-file-segmentation-schema";
import { sendTranslationAsSource } from "@/lib/projects/files/translation-as-source";
import { cancelNativeJob } from "@/lib/projects/jobs/cancel-native-job";
import { createWorkflowTaskJob } from "@/lib/projects/jobs/create-workflow-task-job";
import { enqueueFileTranslationJob } from "@/lib/projects/jobs/enqueue-file-translation-job";
import { markTaskDone } from "@/lib/projects/jobs/mark-task-done";
import { updateNativeJob } from "@/lib/projects/jobs/update-native-job";
import { loadProjectTranslationsAsPrefilledEntries } from "@/lib/projects/translations/project-translation-service";
import { messageFormatSchema } from "@/lib/i18n/message-format";
import { isErr } from "@/lib/primitives/result/results";
import { startTranslationQaScan } from "@/lib/qa/run-project-qa-scan";
import { updateJobs } from "@/lib/job-change-events/job-writes";
import type {
  JobQueue,
  TranslationFileImportQueue,
  TranslationJobEventData,
  TranslationQaScanQueue,
} from "@/lib/workflow/types";

import type { issueSheetImportBodySchema } from "@/api/routes/project/issue-sheet.schema";
import type { z } from "zod";

type ImportBody = z.infer<typeof issueSheetImportBodySchema>;

export type IrisProjectActionDeps = {
  jobQueue: JobQueue<TranslationJobEventData>;
  qaQueue: TranslationQaScanQueue;
  importQueue: TranslationFileImportQueue;
};

type ActionResult = { status: number; body: Record<string, unknown> };

function fail(status: number, code: string, message: string): ActionResult {
  return { status, body: { error: code, message } };
}

function ok(body: Record<string, unknown>, status = 200): ActionResult {
  return { status, body: { result: body } };
}

function sourceLocaleOf(project: { sourceLocale: string | null }): string | null {
  const locale = project.sourceLocale?.trim();
  return locale ? locale : null;
}

type NativeProjectRow = typeof schema.projects.$inferSelect;

type AccessibleNativeProject = {
  project: NativeProjectRow;
  role: OrganizationMembershipRole;
};

function jobAccessWhere(organizationId: string, projectId: string): SQL {
  return and(eq(schema.jobs.organizationId, organizationId), eq(schema.jobs.projectId, projectId))!;
}

async function loadAccessibleNativeProject(
  organizationId: string,
  userId: string,
  projectId: string,
): Promise<AccessibleNativeProject | null> {
  const [membership] = await db
    .select({ role: schema.organizationMemberships.role })
    .from(schema.organizationMemberships)
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, organizationId),
        eq(schema.organizationMemberships.userId, userId),
      ),
    )
    .limit(1);
  if (!membership) return null;

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.organizationId, organizationId),
        eq(schema.projects.source, "native"),
      ),
    )
    .limit(1);
  if (!project) return null;

  if (hasCapability(membership.role, "teams:write")) {
    return { project, role: membership.role };
  }

  const [team] = await db
    .select({ id: schema.teams.id })
    .from(schema.teamMemberships)
    .innerJoin(schema.teams, eq(schema.teamMemberships.teamId, schema.teams.id))
    .where(
      and(
        eq(schema.teamMemberships.userId, userId),
        eq(schema.teams.organizationId, organizationId),
        project.teamId
          ? eq(schema.teams.id, project.teamId)
          : eq(schema.teams.slug, DEFAULT_WORKSPACE_TEAM_SLUG),
      ),
    )
    .limit(1);
  if (!team) return null;

  return { project, role: membership.role };
}

async function storedFileIdForPath(organizationId: string, projectId: string, sourcePath: string) {
  const [version] = await db
    .select({ storedFileId: schema.repositorySourceFileVersions.storedFileId })
    .from(schema.repositorySourceFileVersions)
    .where(
      and(
        eq(schema.repositorySourceFileVersions.organizationId, organizationId),
        eq(schema.repositorySourceFileVersions.projectId, projectId),
        eq(schema.repositorySourceFileVersions.sourcePath, sourcePath),
      ),
    )
    .orderBy(desc(schema.repositorySourceFileVersions.createdAt))
    .limit(1);
  return version?.storedFileId ?? null;
}

function bytesOf(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function runIrisProjectAction(
  action: string,
  payload: Record<string, unknown>,
  deps: IrisProjectActionDeps,
): Promise<ActionResult> {
  const organizationId = asString(payload.organizationId);
  const userId = asString(payload.userId);
  const projectId = asString(payload.projectId);
  if (!organizationId || !userId || !projectId) {
    return fail(400, "invalid_request_body", "organization, user, and project are required");
  }

  switch (action) {
    case "upload_file":
    case "download_file":
    case "import_translations":
    case "translate_file":
    case "file_settings_get":
    case "file_settings_patch":
    case "use_translation_as_source":
    case "create_job":
    case "job_action":
    case "qa_start":
    case "import_queries":
      break;
    default:
      return fail(400, "unknown_project_action", "Unknown project action");
  }

  const accessible = await loadAccessibleNativeProject(organizationId, userId, projectId);
  if (!accessible) return fail(404, "project_not_found", "Project not found");
  const { project, role } = accessible;

  switch (action) {
    case "upload_file":
      return upload(organizationId, userId, project, payload);
    case "download_file":
      return download(organizationId, projectId, payload);
    case "import_translations":
      return importTranslations(organizationId, userId, projectId, payload, deps);
    case "translate_file":
      return translateFile(organizationId, userId, project, payload, deps);
    case "file_settings_get":
      return fileSettings(organizationId, projectId, payload, false);
    case "file_settings_patch":
      return fileSettings(organizationId, projectId, payload, true);
    case "use_translation_as_source":
      return useTranslation(organizationId, userId, project, payload);
    case "create_job":
      return createJob(organizationId, userId, project, payload, deps);
    case "job_action":
      return jobAction(organizationId, userId, projectId, role, payload, deps);
    case "qa_start":
      return qaStart(organizationId, userId, projectId, deps);
    case "import_queries":
      return importQueries(organizationId, userId, projectId, payload);
    default:
      return fail(400, "unknown_project_action", "Unknown project action");
  }
}

async function upload(
  organizationId: string,
  userId: string,
  project: NativeProjectRow,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const bytes = bytesOf(payload.contentBase64);
  const sourcePath = asString(payload.sourcePath);
  if (!bytes || !sourcePath)
    return fail(400, "invalid_request_body", "File and source path are required");
  const uploaded = await uploadSourceFile({
    organizationId,
    project,
    file: {
      filename: asString(payload.filename) || sourcePath,
      contentType: "application/octet-stream",
      content: bytes,
    },
    sourcePath,
    branch: typeof payload.branch === "string" ? payload.branch : null,
    uploadSurface: "iris",
    keepApprovedTranslations: payload.keepApproved === true,
    uploadedByUserId: userId,
  });
  if (isErr(uploaded)) return fail(400, uploaded.error.code, "Upload failed");
  return ok({ sourcePath, fileId: uploaded.value.file.id }, 201);
}

async function download(
  organizationId: string,
  projectId: string,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const sourcePath = asString(payload.sourcePath);
  const locale = asString(payload.locale);
  if (!sourcePath || !locale)
    return fail(400, "invalid_request_body", "source path and locale are required");
  const office = await loadProjectOfficeTranslationDownload({
    organizationId,
    projectId,
    sourcePath,
    targetLocale: locale,
  });
  if (!isErr(office) && office.value) {
    return ok({
      filename: sourcePath.split("/").pop() ?? "download",
      contentBase64: Buffer.from(office.value.content).toString("base64"),
    });
  }
  const pdf = await loadProjectPdfTranslationDownload({
    organizationId,
    projectId,
    sourcePath,
    targetLocale: locale,
  });
  if (!isErr(pdf) && pdf.value) {
    return ok({
      filename: sourcePath.split("/").pop() ?? "download",
      contentBase64: Buffer.from(pdf.value.content).toString("base64"),
    });
  }
  const source = await loadProjectSourceFormatTranslationDownload({
    organizationId,
    projectId,
    sourcePath,
    targetLocale: locale,
  });
  if (source?.kind === "file") {
    return ok({
      filename: sourcePath.split("/").pop() ?? "download",
      contentBase64: Buffer.from(source.content).toString("base64"),
    });
  }
  const entries = await loadProjectTranslationsAsPrefilledEntries({
    organizationId,
    projectId,
    sourcePath,
    targetLocale: locale,
    includeAllSourceKeys: true,
  });
  return ok({
    filename: `${sourcePath.split("/").pop() ?? "download"}.json`,
    contentBase64: Buffer.from(JSON.stringify(entries)).toString("base64"),
  });
}

async function importTranslations(
  organizationId: string,
  userId: string,
  projectId: string,
  payload: Record<string, unknown>,
  deps: IrisProjectActionDeps,
): Promise<ActionResult> {
  const sourcePath = asString(payload.sourcePath);
  const locale = asString(payload.locale);
  const branchName = asString(payload.branch).trim() || undefined;
  const bytes = bytesOf(payload.contentBase64);
  if (!sourcePath || !locale || !bytes) {
    return fail(400, "invalid_request_body", "File, source path, and locale are required");
  }
  const storedFile = await createStoredFile({
    organizationId,
    projectId,
    createdByUserId: userId,
    role: "reference",
    sourceKind: "tms_file",
    filename: asString(payload.filename) || sourcePath,
    contentType: "application/octet-stream",
    content: bytes,
    metadata: { sourcePath, targetLocale: locale, uploadSurface: "iris", branch: branchName },
    adapter: getFileStorageAdapter(),
  });
  await deps.importQueue.enqueue({
    organizationId,
    projectId,
    storedFileId: storedFile.id,
    sourcePath,
    targetLocale: locale,
    actorUserId: userId,
    branchName,
  });
  return ok({ imported: true, sourcePath, locale }, 201);
}

async function translateFile(
  organizationId: string,
  userId: string,
  project: NativeProjectRow,
  payload: Record<string, unknown>,
  deps: IrisProjectActionDeps,
): Promise<ActionResult> {
  const sourceLocale = sourceLocaleOf(project);
  if (!sourceLocale) return fail(400, "invalid_request_body", "Project has no source language");
  const sourcePath = asString(payload.sourcePath);
  const locales = Array.isArray(payload.locales) ? payload.locales.map(String) : [];
  const fileId = await storedFileIdForPath(organizationId, project.id, sourcePath);
  if (!fileId) return fail(404, "source_file_not_found", "Source file not found");
  const created = await enqueueFileTranslationJob({
    organizationId,
    projectId: project.id,
    createdByUserId: userId,
    sourceFileId: fileId,
    sourceLocale,
    targetLocales: locales,
    assigneeType: "agent",
    jobQueue: deps.jobQueue,
    metadata: payload.forceEmpty === true ? { forceEmpty: "true" } : undefined,
  });
  if (!created.ok) return fail(400, created.code, created.message);
  return ok({ jobId: created.jobId, sourcePath }, 201);
}

async function fileSettings(
  organizationId: string,
  projectId: string,
  payload: Record<string, unknown>,
  write: boolean,
): Promise<ActionResult> {
  const sourcePath = asString(payload.sourcePath);
  const kind = asString(payload.kind);
  const scope = { organizationId, projectId, sourcePath };
  if (kind === "segmentation") {
    if (!write) {
      const record = await getRepositorySourceFileSegmentation(scope);
      if (!record) return fail(404, "source_file_not_found", "Source file not found");
      return ok({ settings: record.segmentation });
    }
    const settings = repositorySourceFileSegmentationSettingsSchema.safeParse(payload.settings);
    if (!settings.success)
      return fail(400, "invalid_request_body", "Invalid segmentation settings");
    const result = await updateRepositorySourceFileSegmentation({
      ...scope,
      settings: settings.data,
    });
    if (!result.ok) return fail(400, result.error, "Could not update segmentation");
    return ok({ settings: result.segmentation ?? payload.settings });
  }
  if (kind === "placeholder") {
    if (!write) {
      const settings = await getRepositorySourceFilePlaceholderSettings(scope);
      return ok({ settings });
    }
    const messageFormat = messageFormatSchema.safeParse(
      (payload.settings as { messageFormat?: unknown } | undefined)?.messageFormat,
    );
    if (!messageFormat.success)
      return fail(400, "invalid_request_body", "messageFormat is required");
    const settings = await updateRepositorySourceFilePlaceholderSettings({
      ...scope,
      messageFormat: messageFormat.data,
    });
    return ok({ settings });
  }
  if (kind === "import") {
    if (!write) {
      const record = await getRepositorySourceFileImportSettings(scope);
      if (!record) return fail(404, "source_file_not_found", "Source file not found");
      return ok({ settings: record.importSettings });
    }
    const result = await updateRepositorySourceFileImportSettings({
      ...scope,
      settings: payload.settings as never,
    });
    if (!result.ok) return fail(400, String(result.error), "Could not update import settings");
    return ok({ settings: result.importSettings });
  }
  return fail(400, "invalid_request_body", "Unknown file settings kind");
}

async function useTranslation(
  organizationId: string,
  userId: string,
  source: NativeProjectRow,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const destination = await loadAccessibleNativeProject(
    organizationId,
    userId,
    asString(payload.destinationProjectId),
  );
  if (!destination) return fail(404, "project_not_found", "Project not found");
  const sent = await sendTranslationAsSource({
    organizationId,
    sourceProject: source,
    destinationProject: destination.project,
    sourcePath: asString(payload.sourcePath),
    locale: asString(payload.locale),
    actorUserId: userId,
    replaceVersionId:
      typeof payload.replaceVersionId === "string" ? payload.replaceVersionId : undefined,
  });
  if (isErr(sent)) return fail(400, sent.error.code, "Could not send the translation as source");
  return ok({ sent: true, sourcePath: asString(payload.sourcePath) });
}

async function createJob(
  organizationId: string,
  userId: string,
  project: NativeProjectRow,
  payload: Record<string, unknown>,
  deps: IrisProjectActionDeps,
): Promise<ActionResult> {
  const sourceLocale = sourceLocaleOf(project);
  if (!sourceLocale) return fail(400, "invalid_request_body", "Project has no source language");
  const files = Array.isArray(payload.fileIds) ? payload.fileIds.map(String) : [];
  const locales = Array.isArray(payload.targetLocales) ? payload.targetLocales.map(String) : [];
  const title = asString(payload.title);
  const description = typeof payload.description === "string" ? payload.description : undefined;
  const assigneeIds = Array.isArray(payload.assigneeUserIds)
    ? payload.assigneeUserIds.map(String)
    : [];
  const metadata: Record<string, string> = { title };
  if (description) metadata.description = description;
  const jobs: { id: string; title: string }[] = [];
  for (const sourcePath of files) {
    const fileId =
      sourcePath.includes("/") || sourcePath.includes(".")
        ? await storedFileIdForPath(organizationId, project.id, sourcePath)
        : sourcePath;
    if (!fileId) return fail(404, "source_file_not_found", "Source file not found");
    if (payload.kind === "proofread") {
      const assigneeWorkosUserId = assigneeIds[0] ? await workosUserId(assigneeIds[0]) : undefined;
      const created = await createWorkflowTaskJob({
        organizationId,
        projectId: project.id,
        sourceFileId: fileId,
        sourceLocale,
        targetLocales: locales,
        step: "proofread",
        title,
        ...(assigneeWorkosUserId ? { assigneeWorkosUserId } : {}),
        metadata,
      });
      if (isErr(created)) return fail(400, created.error.code, created.error.message);
      jobs.push({ id: created.value.jobId, title });
      continue;
    }
    const created = await enqueueFileTranslationJob({
      organizationId,
      projectId: project.id,
      createdByUserId: userId,
      sourceFileId: fileId,
      sourceLocale,
      targetLocales: locales,
      assigneeType: assigneeIds[0] ? "user" : "agent",
      ...(assigneeIds[0] ? { ownerUserId: assigneeIds[0] } : {}),
      metadata,
      jobQueue: deps.jobQueue,
    });
    if (!created.ok) return fail(400, created.code, created.message);
    jobs.push({ id: created.jobId, title });
  }
  return ok({ jobs }, 201);
}

async function workosUserId(userId: string): Promise<string | null> {
  const [member] = await db
    .select({ workosUserId: schema.users.workosUserId })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return member?.workosUserId ?? null;
}

async function jobAction(
  organizationId: string,
  userId: string,
  projectId: string,
  role: OrganizationMembershipRole,
  payload: Record<string, unknown>,
  deps: IrisProjectActionDeps,
): Promise<ActionResult> {
  const jobId = asString(payload.jobId);
  const action = asString(payload.action);
  const accessWhere = jobAccessWhere(organizationId, projectId);
  if (action === "cancel") {
    const cancelled = await cancelNativeJob({
      organizationId,
      jobId,
      actorUserId: userId,
      accessWhere,
    });
    if (isErr(cancelled)) return fail(409, cancelled.error.code, "Job action is not available");
    return ok({ id: jobId, action });
  }
  if (action === "assign" || action === "due") {
    let ownerWorkosUserId: string | null | undefined;
    if (payload.assigneeUserId === null) ownerWorkosUserId = null;
    if (typeof payload.assigneeUserId === "string") {
      const [member] = await db
        .select({ workosUserId: schema.users.workosUserId })
        .from(schema.users)
        .where(eq(schema.users.id, payload.assigneeUserId))
        .limit(1);
      ownerWorkosUserId = member?.workosUserId ?? null;
    }
    const updated = await updateNativeJob({
      organizationId,
      jobId,
      accessWhere,
      body: {
        ...(ownerWorkosUserId !== undefined ? { ownerWorkosUserId } : {}),
        ...(action === "due"
          ? { dueAt: payload.dueAt === null ? null : asString(payload.dueAt) }
          : {}),
      },
    });
    if (isErr(updated)) return fail(400, updated.error.code, "Could not update the job");
    return ok({ id: jobId, action });
  }
  if (action === "mark_done") {
    const done = await markTaskDone({
      organizationId,
      jobId,
      actorUserId: userId,
      actorMayFinishAnyTask: hasCapability(role, "reviews:approve"),
      accessWhere,
    });
    if (isErr(done)) {
      if (done.error.code === "not_task_assignee") {
        return fail(403, done.error.code, "Only the assignee or a reviewer can finish this task");
      }
      return fail(409, done.error.code, "Job action is not available");
    }
    return ok({ id: jobId, action });
  }
  if (action === "mark_failed") {
    const [failed] = await updateJobs(db, {
      set: { status: "failed", completedAt: new Date(), lastError: "Marked failed" },
      where: and(
        eq(schema.jobs.id, jobId),
        accessWhere,
        eq(schema.jobs.assigneeType, "agent"),
        or(
          eq(schema.jobs.status, "queued"),
          eq(schema.jobs.status, "running"),
          eq(schema.jobs.status, "waiting_for_review"),
        ),
        notExists(
          db
            .select({ jobId: schema.externalJobDetails.jobId })
            .from(schema.externalJobDetails)
            .where(eq(schema.externalJobDetails.jobId, schema.jobs.id)),
        ),
      ),
      returning: { id: schema.jobs.id },
    });
    if (!failed) {
      const [existing] = await db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(and(eq(schema.jobs.id, jobId), accessWhere))
        .limit(1);
      return existing
        ? fail(409, "job_action_unavailable", "Job action is not available")
        : fail(404, "job_not_found", "Job not found");
    }
    return ok({ id: jobId, action });
  }
  if (action === "retry") {
    const [retried] = await updateJobs(db, {
      set: { status: "queued", lastError: null, completedAt: null, workflowRunId: null },
      where: and(
        eq(schema.jobs.id, jobId),
        accessWhere,
        eq(schema.jobs.kind, "translation"),
        or(eq(schema.jobs.status, "queued"), eq(schema.jobs.status, "failed")),
      ),
      returning: { id: schema.jobs.id },
    });
    if (!retried) {
      const [existing] = await db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(and(eq(schema.jobs.id, jobId), accessWhere))
        .limit(1);
      return existing
        ? fail(409, "job_action_unavailable", "Job action is not available")
        : fail(404, "job_not_found", "Job not found");
    }
    await deps.jobQueue.enqueue({
      kind: "translation",
      jobId,
      projectId,
      type: "file",
    });
    return ok({ id: jobId, action });
  }
  return fail(400, "invalid_request_body", "Unknown job action");
}

async function qaStart(
  organizationId: string,
  userId: string,
  projectId: string,
  deps: IrisProjectActionDeps,
): Promise<ActionResult> {
  const started = await startTranslationQaScan({
    organizationId,
    projectId,
    trigger: "manual",
    createdByUserId: userId,
    queue: deps.qaQueue,
  });
  if (!started.ok) {
    const status = started.code === "scan_in_progress" ? 409 : 400;
    return fail(status, started.code, "Could not start the QA scan");
  }
  return ok({ run: { id: started.runId, status: "queued" } }, 201);
}

async function importQueries(
  organizationId: string,
  userId: string,
  projectId: string,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const service = new IssueSheetService();
  const result = await service.importFromCsv({
    organizationId,
    projectId,
    actorUserId: userId,
    body: {
      content: asString(payload.content),
      dryRun: payload.dryRun === true,
      mapping: payload.mapping as ImportBody["mapping"],
    },
  });
  return ok({ import: result }, result.dryRun ? 200 : 201);
}
