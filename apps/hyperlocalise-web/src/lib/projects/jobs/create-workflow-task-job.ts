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
import { insertJobs } from "@/lib/job-change-events/job-writes";
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
import { refuseVendorOwnerUnlessFileTask } from "./job-owner";
import { statusForTaskAfter } from "./waiting-task";

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
  /** The job this task comes after: the task waits until that job is marked done or cancelled. */
  afterJobId?: string;
  metadata?: Record<string, string>;
  branchName?: string | null;
};

export type CreateWorkflowTaskJobError = {
  code:
    | "project_not_found"
    | "source_file_not_found"
    | "unsupported_source_file_format"
    | "assignee_not_found"
    | "job_source_locale_not_in_project"
    | "job_target_locale_not_in_project"
    | "translate_task_cannot_wait"
    | "after_job_not_found"
    | "task_job_create_failed"
    | (string & {});
  message: string;
};

const STEP_TITLE_PREFIX: Record<VisualTaskStep, string> = {
  translate: "Translate",
  edit: "Post-edit",
  proofread: "Proofread",
};

class AfterJobNotFoundError extends Error {}

/**
 * Creates a job a person works on in the editor: translating from scratch, post-editing machine
 * output, or proofreading. Like a proofread job made in the app, it waits for review from the
 * start, is never queued for the translation agent, reserves no AI usage and takes none of the
 * organization's open job slots; the hourly creation rate applies. A post-edit or proofread task
 * that comes after an unfinished job starts as waiting instead (`waiting-task.ts`).
 */
export async function createWorkflowTaskJob(
  input: CreateWorkflowTaskJobInput,
): Promise<
  Result<
    { jobId: string; ownerUserId: string | null; status: "queued" | "waiting_for_review" },
    CreateWorkflowTaskJobError
  >
> {
  if (input.afterJobId && input.step === "translate") {
    return err({
      code: "translate_task_cannot_wait",
      message: "Only a post-edit or proofread task can come after another task.",
    });
  }

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
    // A translate task is not one a vendor can open or finish (`job-owner.ts`).
    const vendorAllowed = await refuseVendorOwnerUnlessFileTask({
      organizationId: input.organizationId,
      ownerUserId: owner.id,
      fileTask: input.step !== "translate",
    });
    if (isErr(vendorAllowed)) {
      return err(vendorAllowed.error);
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
  let status: "queued" | "waiting_for_review" = "waiting_for_review";

  try {
    await db.transaction(async (tx) => {
      const budget = await assertOrganizationCanEnqueueTranslationJobInTransaction(
        tx,
        input.organizationId,
        { isPersonTask: true },
      );
      if (isErr(budget)) {
        throw new OrganizationJobBudgetExceededError(budget.error);
      }

      const branchName = input.branchName?.trim() || undefined;
      const sourceFileVersion = await ensureRepositorySourceFileVersionForStoredFile({
        db: tx,
        organizationId: input.organizationId,
        projectId: input.projectId,
        fileId: input.sourceFileId,
        branchName,
      });
      repositorySourceFileId = sourceFileVersion?.repositorySourceFileId ?? null;

      if (input.afterJobId) {
        const afterStatus = await statusForTaskAfter(tx, {
          organizationId: input.organizationId,
          projectId: input.projectId,
          afterJobId: input.afterJobId,
        });
        if (!afterStatus) {
          throw new AfterJobNotFoundError();
        }
        status = afterStatus;
      }

      await insertJobs(tx, {
        values: {
          id: jobId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          ownerUserId,
          assigneeType: ownerUserId ? "user" : null,
          dueAt: input.dueAt ?? null,
          afterJobId: input.afterJobId ?? null,
          kind: input.step === "translate" ? "translation" : "proofread",
          status,
          inputPayload: {
            sourceFileId: input.sourceFileId,
            fileFormat,
            sourceLocale: input.sourceLocale,
            targetLocales: input.targetLocales,
            metadata: { ...metadata, title },
            ...(branchName ? { branch: branchName } : {}),
          },
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
    if (error instanceof AfterJobNotFoundError) {
      return err({
        code: "after_job_not_found",
        message: "The task to come after was not found in this project.",
      });
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
    status,
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

  return ok({ jobId, ownerUserId, status });
}
