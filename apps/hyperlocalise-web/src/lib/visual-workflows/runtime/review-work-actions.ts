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
import { and, asc, count, desc, eq, exists, inArray, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db, schema } from "@/lib/database/client";
import { DEFAULT_PROJECT_BRANCH_NAME } from "@/lib/projects/branches/project-branch-name";
import { openFileTaskWhere } from "@/lib/projects/jobs/open-file-task";

import type { VisualWorkflowNodeExecutionResult } from "./execution-result";

/** A For each runs at most this many items, so listing more would only fail the loop. */
export const MAX_LISTED_REVIEW_WORK = 100;

export type ReviewWorkItem = {
  /** The project asked about, so a step in the loop can take it from the item. */
  projectId: string;
  /** The file's latest upload, which is what Assign task takes. */
  sourceFileId: string;
  path: string;
  targetLocale: string;
  /** Strings whose translation is waiting for review or is a draft. */
  needsReview: number;
};

function failure(code: string, message: string): VisualWorkflowNodeExecutionResult {
  return { ok: false, error: { code, message } };
}

/**
 * Lists where a project has review work that nobody has been given: each file and language with
 * translations waiting for review (or saved as drafts) and no open post-edit or proofread task.
 *
 * It is how a workflow on a schedule follows up edits made in the content editor. An edit only
 * changes a translation's status, so the work is found from the statuses, not from the edits. A
 * file and language drop out while a task is open on them: that task's editor already shows
 * whatever needs review there, including edits made after the task was given. They come back
 * once every task on them is finished and something still needs review.
 *
 * Only files on the project's main branch are listed. A branch's strings join them when the
 * branch is merged.
 */
export async function runListReviewWorkAction(input: {
  organizationId: string;
  projectId: string;
  pathPrefix: string;
}): Promise<VisualWorkflowNodeExecutionResult> {
  if (!input.projectId) {
    return failure("missing_review_work_config", "Choose a project to look in.");
  }
  const [project] = await db
    .select({ targetLocales: schema.projects.targetLocales })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!project) return failure("project_not_found", "Choose a project in this organization.");
  const targetLocales = project.targetLocales ?? [];
  if (targetLocales.length === 0) {
    return { ok: true, output: { items: [], count: 0, truncated: false } };
  }

  const keys = schema.projectTranslationKeys;
  const translations = schema.projectTranslations;
  const files = schema.repositorySourceFiles;
  const pathPrefix = input.pathPrefix.trim().replace(/^\/+/, "");

  // An open task covers its own file and languages. One with no languages covers them all: no
  // route makes such a task today, and treating it as covering nothing would hand the work out
  // twice.
  const taskVersion = alias(schema.repositorySourceFileVersions, "task_version");
  const earlierJob = alias(schema.jobs, "earlier_job");
  const taskLocales = sql`${schema.jobs.inputPayload}->'targetLocales'`;
  const openTaskOnFileAndLanguage = db
    .select({ jobId: schema.jobs.id })
    .from(schema.jobs)
    .innerJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .innerJoin(taskVersion, eq(taskVersion.id, schema.translationJobDetails.sourceFileVersionId))
    .where(
      and(
        eq(schema.jobs.projectId, input.projectId),
        openFileTaskWhere({ organizationId: input.organizationId, includeWaiting: true }),
        eq(taskVersion.repositorySourceFileId, keys.repositorySourceFileId),
        // A task waiting for a job that failed never opens by itself, so it does not hold the
        // work: the file and language are listed again.
        or(
          ne(schema.jobs.status, "queued"),
          notExists(
            db
              .select({ id: earlierJob.id })
              .from(earlierJob)
              .where(
                and(eq(earlierJob.id, schema.jobs.afterJobId), eq(earlierJob.status, "failed")),
              ),
          ),
        ),
        sql`case when jsonb_typeof(${taskLocales}) = 'array' and jsonb_array_length(${taskLocales}) > 0
          then jsonb_exists(${taskLocales}, ${translations.targetLocale}) else true end`,
      ),
    );

  const uploads = alias(schema.repositorySourceFileVersions, "file_upload");
  const rows = await db
    .select({
      repositorySourceFileId: files.id,
      path: files.sourcePath,
      targetLocale: translations.targetLocale,
      needsReview: count(),
    })
    .from(translations)
    .innerJoin(keys, eq(keys.id, translations.translationKeyId))
    .innerJoin(files, eq(files.id, keys.repositorySourceFileId))
    .where(
      and(
        eq(translations.organizationId, input.organizationId),
        eq(translations.projectId, input.projectId),
        inArray(translations.status, ["needs_review", "draft"]),
        inArray(translations.targetLocale, targetLocales),
        sql`btrim(${translations.text}) <> ''`,
        eq(keys.isHidden, false),
        eq(files.branchName, DEFAULT_PROJECT_BRANCH_NAME),
        pathPrefix ? sql`starts_with(${files.sourcePath}, ${pathPrefix})` : undefined,
        // Assign task names a file by one of its uploads, so a file without one cannot be given.
        exists(
          db
            .select({ id: uploads.id })
            .from(uploads)
            .where(eq(uploads.repositorySourceFileId, files.id)),
        ),
        notExists(openTaskOnFileAndLanguage),
      ),
    )
    .groupBy(files.id, files.sourcePath, translations.targetLocale)
    .orderBy(asc(files.sourcePath), asc(translations.targetLocale))
    .limit(MAX_LISTED_REVIEW_WORK + 1);

  const truncated = rows.length > MAX_LISTED_REVIEW_WORK;
  const listed = truncated ? rows.slice(0, MAX_LISTED_REVIEW_WORK) : rows;
  if (listed.length === 0) {
    return { ok: true, output: { items: [], count: 0, truncated: false } };
  }

  // Give Assign task the file's latest upload.
  const versions = schema.repositorySourceFileVersions;
  const latestUploads = await db
    .selectDistinctOn([versions.repositorySourceFileId], {
      repositorySourceFileId: versions.repositorySourceFileId,
      storedFileId: versions.storedFileId,
    })
    .from(versions)
    .where(
      inArray(versions.repositorySourceFileId, [
        ...new Set(listed.map((row) => row.repositorySourceFileId)),
      ]),
    )
    .orderBy(versions.repositorySourceFileId, desc(versions.createdAt), desc(versions.id));
  const uploadByFile = new Map(
    latestUploads.map((upload) => [upload.repositorySourceFileId, upload.storedFileId]),
  );

  const items: ReviewWorkItem[] = [];
  for (const row of listed) {
    const sourceFileId = uploadByFile.get(row.repositorySourceFileId);
    if (!sourceFileId) continue;
    items.push({
      projectId: input.projectId,
      sourceFileId,
      path: row.path,
      targetLocale: row.targetLocale,
      needsReview: row.needsReview,
    });
  }
  return { ok: true, output: { items, count: items.length, truncated } };
}
