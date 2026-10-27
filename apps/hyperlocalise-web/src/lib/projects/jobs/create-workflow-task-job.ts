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
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { enqueueJobCreatedActivity } from "@/lib/activity-log/job-automation-events";
import { db, schema } from "@/lib/database/client";
import {
  ensureRepositorySourceFileVersionForStoredFile,
  getStoredFileForJobScope,
} from "@/lib/file-storage/records";
import { validateJobLocalesAgainstProject } from "@/lib/i18n/project-job-locales";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { startTaskAnalysis } from "@/lib/reporting/task-analysis-start";
import {
  assertOrganizationCanEnqueueTranslationJobInTransaction,
  OrganizationJobBudgetExceededError,
} from "@/lib/security/organization-operation-budget";
import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";
import type { VisualTaskStep } from "@/lib/visual-workflows/schema/types";

import { mergeNativeFileTranslationJobMetadata } from "./enqueue-file-translation-job";

export type CreateWorkflowTaskJobInput = {
  organizationId: string;
  projectId: string;
  sourceFileId: string;
  sourceLocale: string;
  targetLocales: string[];
  step: VisualTaskStep;
  assigneeWorkosUserId?: string;
  title?: string;
  dueAt?: Date;
  metadata?: Record<string, string>;
};

export type CreateWorkflowTaskJobError = {
  code:
    | "project_not_found"
    | "source_file_not_found"
    | "unsupported_source_file_format"
    | "assignee_not_found"
    | "job_source_locale_not_in_project"
    | "job_target_locale_not_in_project"
    | "task_job_create_failed"
    | (string & {});
  message: string;
};

const STEP_TITLE_PREFIX: Record<VisualTaskStep, string> = {
  translate: "Translate",
  edit: "Post-edit",
  proofread: "Proofread",
};

/**
 * Creates a job a person works on in the editor: translating from scratch, post-editing machine
 * output, or proofreading. Like a proofread job made in the app, it waits for review from the
 * start, is never queued for the translation agent and reserves no AI usage, but still takes one
 * of the organization's open job slots.
 */
export async function createWorkflowTaskJob(
  input: CreateWorkflowTaskJobInput,
): Promise<Result<{ jobId: string; ownerUserId: string | null }, CreateWorkflowTaskJobError>> {
  const [project] = await db
    .select({
      source: schema.projects.source,
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!project) {
    return err({ code: "project_not_found", message: "Choose a project in this organization." });
  }

  const localeValidation = validateJobLocalesAgainstProject(project, {
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
  });
  if (isErr(localeValidation)) {
    return err(localeValidation.error);
  }

  const sourceFile = await getStoredFileForJobScope({
    organizationId: input.organizationId,
    projectId: input.projectId,
    fileId: input.sourceFileId,
  });
  if (!sourceFile) {
    return err({ code: "source_file_not_found", message: "Source file not found." });
  }
  const fileFormat = inferSupportedTranslationFileFormat(sourceFile.filename);
  if (!fileFormat) {
    return err({
      code: "unsupported_source_file_format",
      message: "Unsupported source file format.",
    });
  }

  let ownerUserId: string | null = null;
  if (input.assigneeWorkosUserId) {
    const [owner] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .innerJoin(
        schema.organizationMemberships,
        eq(schema.organizationMemberships.userId, schema.users.id),
      )
      .where(
        and(
          eq(schema.users.workosUserId, input.assigneeWorkosUserId),
          eq(schema.organizationMemberships.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!owner) {
      return err({
        code: "assignee_not_found",
        message: "The assignee must be a member of this organization.",
      });
    }
    ownerUserId = owner.id;
  }

  const sourcePath =
    sourceFile.metadata &&
    typeof sourceFile.metadata === "object" &&
    !Array.isArray(sourceFile.metadata) &&
    typeof sourceFile.metadata.sourcePath === "string"
      ? sourceFile.metadata.sourcePath
      : undefined;
  const metadata = mergeNativeFileTranslationJobMetadata(sourceFile.filename, {
    ...(sourcePath ? { sourcePath } : {}),
    ...input.metadata,
    workflowTaskStep: input.step,
  });
  const title = input.title?.trim() || `${STEP_TITLE_PREFIX[input.step]}: ${metadata.title}`;
  const jobId = `job_${randomUUID()}`;
  let repositorySourceFileId: string | null = null;

  try {
    await db.transaction(async (tx) => {
      const budget = await assertOrganizationCanEnqueueTranslationJobInTransaction(
        tx,
        input.organizationId,
      );
      if (isErr(budget)) {
        throw new OrganizationJobBudgetExceededError(budget.error);
      }

      const sourceFileVersion = await ensureRepositorySourceFileVersionForStoredFile({
        db: tx,
        organizationId: input.organizationId,
        projectId: input.projectId,
        fileId: input.sourceFileId,
      });
      repositorySourceFileId = sourceFileVersion?.repositorySourceFileId ?? null;

      await tx.insert(schema.jobs).values({
        id: jobId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        ownerUserId,
        assigneeType: ownerUserId ? "user" : null,
        dueAt: input.dueAt ?? null,
        kind: input.step === "translate" ? "translation" : "proofread",
        status: "waiting_for_review",
        inputPayload: {
          sourceFileId: input.sourceFileId,
          fileFormat,
          sourceLocale: input.sourceLocale,
          targetLocales: input.targetLocales,
          metadata: { ...metadata, title },
        },
      });
      await tx.insert(schema.translationJobDetails).values({
        jobId,
        type: "file",
        sourceFileVersionId: sourceFileVersion?.id ?? null,
      });
    });
  } catch (error) {
    if (error instanceof OrganizationJobBudgetExceededError) {
      return err({ code: error.budgetError.code, message: error.budgetError.message });
    }
    return err({ code: "task_job_create_failed", message: "Unable to create the task." });
  }

  await enqueueJobCreatedActivity({
    actorCredentialId: null,
    actorKind: "agent",
    actorUserId: null,
    jobId,
    kind: input.step === "translate" ? "translation" : "proofread",
    organizationId: input.organizationId,
    projectId: input.projectId,
    status: "waiting_for_review",
  });

  // The task runs no agent, so Reports records its strings now, in the background.
  if (repositorySourceFileId) {
    await startTaskAnalysis({
      organizationId: input.organizationId,
      projectId: input.projectId,
      jobId,
      // Translate tasks are translation work; post-edit and proofread tasks are review work, as
      // the task's kind says, so a save in them is found by the open-task lookup for that step.
      step: input.step === "translate" ? "translation" : "review",
      sourceLocale: input.sourceLocale,
      targetLocales: input.targetLocales,
      repositorySourceFileId,
    });
  }

  return ok({ jobId, ownerUserId });
}
